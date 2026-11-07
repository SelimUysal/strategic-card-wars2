import { CollectionManager } from '../cards/CollectionManager';
import { TimeManager } from '../core/TimeManager';
import { COMMANDERS } from '../data/commanders';
import { MATCH_RULES } from '../data/matchRules';
import {
  CommanderDef,
  CommanderId,
  DifficultyId,
  Team,
} from '../types';
import { ModifierRegistry } from '../units/UnitStats';
import { FogOfWar } from '../world/FogOfWar';
import { Commander } from './Commander';
import { CommanderAbilities } from './CommanderAbilities';

export class CommanderManager {
  private playerCommander: Commander | null = null;
  private enemyCommander: Commander | null = null;

  constructor(
    private collectionManager?: CollectionManager,
    private modifierRegistry?: ModifierRegistry,
    private fogOfWar?: FogOfWar,
    private timeManager?: TimeManager,
    private commanderAbilities?: CommanderAbilities
  ) {}

  public setDependencies(deps: {
    collectionManager?: CollectionManager;
    modifierRegistry?: ModifierRegistry;
    fogOfWar?: FogOfWar;
    timeManager?: TimeManager;
    commanderAbilities?: CommanderAbilities;
  }): void {
    if (deps.collectionManager) this.collectionManager = deps.collectionManager;
    if (deps.modifierRegistry) this.modifierRegistry = deps.modifierRegistry;
    if (deps.fogOfWar) this.fogOfWar = deps.fogOfWar;
    if (deps.timeManager) this.timeManager = deps.timeManager;
    if (deps.commanderAbilities) this.commanderAbilities = deps.commanderAbilities;
  }

  // SPEC S3: selectCommander(team, id | null)
  // Oyuncu için yalnızca CollectionManager'da açık komutan seçilebilir; değilse hata.
  // Cehennem modunda iki takımda da komutan yoktur (null).
  public selectCommander(team: Team, id: CommanderId | null): void {
    if (id === null) {
      if (team === 'player') {
        this.playerCommander = null;
      } else {
        this.enemyCommander = null;
      }
      return;
    }

    const def = COMMANDERS[id];
    if (!def) {
      throw new Error(`Geçersiz komutan ID: ${id}`);
    }

    if (team === 'player') {
      if (this.collectionManager && !this.collectionManager.isCommanderUnlocked(id)) {
        throw new Error(`Seçilen komutan henüz açık değil: ${id}`);
      }
      this.playerCommander = new Commander(def, 'player');
    } else {
      this.enemyCommander = new Commander(def, 'enemy');
    }
  }

  // SPEC S3: Maç başlatılırken zorluğa göre komutan ataması
  public setupForMatch(
    difficultyId: DifficultyId,
    seed: number,
    playerCommanderId: CommanderId | null
  ): void {
    // Cehennem modunda iki takımda da komutan yoktur (null)
    if (difficultyId === 'cehennem') {
      this.selectCommander('player', null);
      this.selectCommander('enemy', null);
      return;
    }

    this.selectCommander('player', playerCommanderId);
    const enemyCmdId = this.pickRandomEnemyCommander(seed);
    this.selectCommander('enemy', enemyCmdId);
  }

  // SPEC S3: applyAtMatchStart()
  // Seçili komutanın her etkisini ilgili takım için uygular:
  // statPct -> ModifierRegistry.addModifier({ source: 'commander:<id>', team, stat, pct, filter });
  // periodicHealPct -> CommanderAbilities zamanlayıcısı;
  // ignoreFog -> yalnızca takım 'player' ise FogOfWar.setPlayerIgnoresFog(true) (düşman yapay zekâsı zaten sisten etkilenmez)
  public applyAtMatchStart(): void {
    // Önceden kalan etkileri temizle
    this.removeAll();

    const activeCommanders: Commander[] = [];
    if (this.playerCommander) activeCommanders.push(this.playerCommander);
    if (this.enemyCommander) activeCommanders.push(this.enemyCommander);

    for (const cmd of activeCommanders) {
      const team = cmd.team;
      const source = `commander:${cmd.id}`;

      for (const effect of cmd.effects) {
        if (effect.kind === 'statPct') {
          if (this.modifierRegistry) {
            this.modifierRegistry.addModifier({
              source,
              team,
              stat: effect.stat,
              pct: effect.pct,
              filter: effect.filter,
            });
          }
        } else if (effect.kind === 'periodicHealPct') {
          if (this.commanderAbilities) {
            this.commanderAbilities.registerPeriodicHeal(team, effect.everySec, effect.pct);
          }
        } else if (effect.kind === 'ignoreFog') {
          if (team === 'player' && this.fogOfWar) {
            this.fogOfWar.setPlayerIgnoresFog(true);
          }
        }
      }
    }
  }

  // SPEC S3: removeAll()
  // Maç sonunda bütün etkileri kaldırır
  public removeAll(): void {
    if (this.playerCommander && this.modifierRegistry) {
      this.modifierRegistry.removeBySource(`commander:${this.playerCommander.id}`);
    }
    if (this.enemyCommander && this.modifierRegistry) {
      this.modifierRegistry.removeBySource(`commander:${this.enemyCommander.id}`);
    }

    if (this.commanderAbilities) {
      this.commanderAbilities.clear();
    }

    if (this.fogOfWar) {
      this.fogOfWar.setPlayerIgnoresFog(false);
    }
  }

  // SPEC S3: pickRandomEnemyCommander(seed)
  // COMMANDERS'ın 10 komutanından tohumlu rastgele biri (hepsi havuzdadır)
  public pickRandomEnemyCommander(seed: number): CommanderId {
    const commanderIds = Object.keys(COMMANDERS) as CommanderId[];

    // Tohumlu deterministik rastgele sayı üretici (Mulberry32)
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const rnd = ((t ^ (t >>> 14)) >>> 0) / 4294967296;

    const index = Math.floor(rnd * commanderIds.length);
    return commanderIds[index];
  }

  // SPEC S4: Simülasyon zamanı güncellemesi (yetenek zamanlayıcıları)
  public update(simDt: number): void {
    if (this.commanderAbilities) {
      this.commanderAbilities.update(simDt);
    }
  }

  // SPEC S5: isEnemyCommanderRevealed()
  // maç saati >= combatStartRealSec (300) VEYA oyuncunun komutanı ignoreFog etkisine sahipse true; aksi hâlde false
  public isEnemyCommanderRevealed(): boolean {
    // 1. Oyuncunun komutanı ignoreFog etkisine sahipse (II. Abdülhamid)
    if (this.playerCommander?.effects.some((e) => e.kind === 'ignoreFog')) {
      return true;
    }

    // 2. Maç saati combatStartRealSec (300 saniye / 5 dk) veya üstündeyse
    if (
      this.timeManager &&
      this.timeManager.matchClockRealSec >= MATCH_RULES.combatStartRealSec
    ) {
      return true;
    }

    return false;
  }

  // SPEC S5: Oyuncunun kendi komutanı her zaman görünür
  public isPlayerCommanderRevealed(): boolean {
    return true;
  }

  // Getter fonksiyonları
  public getCommander(team: Team): Commander | null {
    return team === 'player' ? this.playerCommander : this.enemyCommander;
  }

  public getCommanderDef(team: Team): CommanderDef | null {
    const cmd = this.getCommander(team);
    return cmd ? cmd.def : null;
  }

  public getCommanderId(team: Team): CommanderId | null {
    const cmd = this.getCommander(team);
    return cmd ? cmd.id : null;
  }
}
