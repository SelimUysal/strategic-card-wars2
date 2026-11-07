import { EventManager } from '../core/EventManager';
import { MATCH_RULES } from '../data/matchRules';
import { UNITS } from '../data/units';
import { Team } from '../types';
import { Unit } from '../units/Unit';
import { UnitManager } from '../units/UnitManager';

export class ResourceManager {
  // Takım başına altın ve odun stoğu
  private gold: Record<Team, number> = { player: 0, enemy: 0 };
  private wood: Record<Team, number> = { player: 0, enemy: 0 };

  // Yalnızca toplanan (gathered: true) kaynak sayaçları
  private goldGathered: Record<Team, number> = { player: 0, enemy: 0 };
  private woodGathered: Record<Team, number> = { player: 0, enemy: 0 };

  // Nüfus limitleri ve rezerve nüfus
  private caps: Record<Team, number> = { player: MATCH_RULES.popCap, enemy: MATCH_RULES.popCap };
  private reservedPop: Record<Team, number> = { player: 0, enemy: 0 };
  private livePop: Record<Team, number> = { player: 0, enemy: 0 };

  constructor(
    private eventManager?: EventManager,
    private unitManager?: UnitManager
  ) {
    // Varsayılan başlangıç değerleri
    this.init('player', MATCH_RULES.playerStartGold, MATCH_RULES.playerStartWood, MATCH_RULES.popCap);
    this.init('enemy', MATCH_RULES.playerStartGold, MATCH_RULES.playerStartWood, MATCH_RULES.popCap);

    // Olay dinleyicileri
    if (this.eventManager) {
      // Birim doğduğunda nüfus takibi
      this.eventManager.on('unitSpawned', ({ unit }: { unit: Unit }) => {
        const pop = UNITS[unit.defId]?.pop || 0;
        this.livePop[unit.team] += pop;
        this.emitResourcesChanged(unit.team);
      });

      // SPEC S1: İşçi öldüğünde nüfus boşalır; asker öldüğünde de boşalır ('unitDied' olayını dinle)
      this.eventManager.on('unitDied', ({ unit }: { unit: Unit }) => {
        const pop = UNITS[unit.defId]?.pop || 0;
        this.livePop[unit.team] = Math.max(0, this.livePop[unit.team] - pop);
        this.emitResourcesChanged(unit.team);
      });
    }
  }

  // SPEC S1: init(team, gold, wood, popCap)
  public init(team: Team, gold: number, wood: number, popCap: number): void {
    this.gold[team] = gold;
    this.wood[team] = wood;
    this.caps[team] = popCap;
    this.reservedPop[team] = 0;
    this.livePop[team] = 0;
    this.goldGathered[team] = 0;
    this.woodGathered[team] = 0;
    this.emitResourcesChanged(team);
  }

  // SPEC S1: canAfford(team, gold, wood)
  public canAfford(team: Team, gold: number, wood: number): boolean {
    return this.gold[team] >= gold && this.wood[team] >= wood;
  }

  // SPEC S1: spend(team, gold, wood)
  public spend(team: Team, gold: number, wood: number): boolean {
    if (!this.canAfford(team, gold, wood)) {
      return false;
    }
    this.gold[team] -= gold;
    this.wood[team] -= wood;
    this.emitResourcesChanged(team);
    return true;
  }

  // SPEC S1: refund(team, gold, wood)
  public refund(team: Team, gold: number, wood: number): void {
    this.gold[team] += gold;
    this.wood[team] += wood;
    this.emitResourcesChanged(team);
  }

  // SPEC S1: add(team, type, amount, gathered: boolean)
  public add(team: Team, type: 'gold' | 'wood', amount: number, gathered: boolean): void {
    if (amount <= 0) return;

    if (type === 'gold') {
      this.gold[team] += amount;
      if (gathered) {
        this.goldGathered[team] += amount;
      }
    } else {
      this.wood[team] += amount;
      if (gathered) {
        this.woodGathered[team] += amount;
      }
    }
    this.emitResourcesChanged(team);
  }

  // SPEC S1: Nüfus metodları
  public popUsed(team: Team): number {
    if (this.unitManager) {
      const activeUnits = this.unitManager.getUnits(team);
      let calculatedLivePop = 0;
      for (const u of activeUnits) {
        if (u.state !== 'dead') {
          calculatedLivePop += UNITS[u.defId]?.pop || 0;
        }
      }
      return this.reservedPop[team] + calculatedLivePop;
    }
    return this.reservedPop[team] + this.livePop[team];
  }

  public popCap(team: Team): number {
    return this.caps[team];
  }

  public canReservePop(team: Team, n: number): boolean {
    return this.popUsed(team) + n <= this.popCap(team);
  }

  public reservePop(team: Team, n: number): boolean {
    if (!this.canReservePop(team, n)) {
      return false;
    }
    this.reservedPop[team] += n;
    this.emitResourcesChanged(team);
    return true;
  }

  public releasePop(team: Team, n: number): void {
    this.reservedPop[team] = Math.max(0, this.reservedPop[team] - n);
    this.emitResourcesChanged(team);
  }

  // Okuma metodları
  public getGold(team: Team): number {
    return this.gold[team];
  }

  public getWood(team: Team): number {
    return this.wood[team];
  }

  public getGoldGathered(team: Team): number {
    return this.goldGathered[team];
  }

  public getWoodGathered(team: Team): number {
    return this.woodGathered[team];
  }

  private emitResourcesChanged(team: Team): void {
    if (this.eventManager) {
      this.eventManager.emit('resourcesChanged', {
        team,
        gold: this.gold[team],
        wood: this.wood[team],
        popUsed: this.popUsed(team),
        popCap: this.popCap(team),
      });
    }
  }
}
