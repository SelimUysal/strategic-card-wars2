import { EventManager } from '../core/EventManager';
import { MatchPhase, MatchPhaseManager } from '../core/MatchPhaseManager';
import { MATCH_RULES } from '../data/matchRules';
import { UNITS } from '../data/units';
import { Team, TilePos } from '../types';
import { Unit } from '../units/Unit';
import { UnitManager } from '../units/UnitManager';
import { GameMap } from '../world/MapConfig';
import { Pathfinding } from '../world/Pathfinding';
import { CombatManager } from './CombatManager';

export class BattleAI {
  private rallyPoints: Record<Team, TilePos> = {
    player: { x: 0, y: 0 },
    enemy: { x: 0, y: 0 },
  };
  private commonAreaCenterTile: TilePos = { x: 0, y: 0 };
  private updateTimer: number = 0;
  private readonly AI_INTERVAL_SEC: number = 1.0;

  constructor(
    private matchPhaseManager: MatchPhaseManager,
    private unitManager: UnitManager,
    private map: GameMap,
    private pathfinding: Pathfinding,
    private combatManager: CombatManager,
    private eventManager?: EventManager
  ) {
    if (this.unitManager.setPathfinding) {
      this.unitManager.setPathfinding(this.pathfinding);
    }
    this.initPoints();

    // SPEC S4: Yeni üretilen asker, o anki evrenin davranışını uygular
    if (this.eventManager) {
      this.eventManager.on('unitSpawned', ({ unit }: { unit: Unit }) => {
        // İşçiler BattleAI'dan etkilenmez
        if (UNITS[unit.defId]?.tags.includes('worker')) return;

        // Varsayılan modlar: Oyuncu 'attack', Düşman 'waiting'
        unit.mode = unit.team === 'player' ? 'attack' : 'waiting';

        // Anlık evre davranışını uygula
        this.applySoldierPhaseBehavior(unit, this.matchPhaseManager.getPhase());
      });
    }
  }

  // SPEC S4: Dışarıdan moda geçiş (Adım 12 kullanacak)
  public setAttackMode(unit: Unit, attack: boolean): void {
    unit.mode = attack ? 'attack' : 'waiting';
  }

  // SPEC S4: update(dt)
  public update(dt: number): void {
    this.updateTimer += dt;
    if (this.updateTimer < this.AI_INTERVAL_SEC) {
      return;
    }
    this.updateTimer = 0;

    const phase = this.matchPhaseManager.getPhase();
    const allUnits = this.unitManager.getUnits();
    const soldiers = allUnits.filter(
      (u) => u.state !== 'dead' && !UNITS[u.defId]?.tags.includes('worker')
    );

    // SPEC S4: Askerleri takımlarına göre grupla ve yuva indekslerini belirle
    const playerSoldiers = soldiers.filter((s) => s.team === 'player');
    const enemySoldiers = soldiers.filter((s) => s.team === 'enemy');

    for (let i = 0; i < playerSoldiers.length; i++) {
      this.applySoldierPhaseBehavior(playerSoldiers[i], phase, i);
    }
    for (let i = 0; i < enemySoldiers.length; i++) {
      this.applySoldierPhaseBehavior(enemySoldiers[i], phase, i);
    }
  }

  // SPEC S4: Toplanma ve ortak alanda bekleyen askerler için yuva hesaplama [EK]
  private getSlotTargetTile(centerTile: TilePos, slotIndex: number): TilePos {
    const spacing = MATCH_RULES.rallySlotSpacing;
    let offsetX = 0;
    let offsetY = 0;

    if (slotIndex > 0) {
      if (slotIndex <= 6) {
        const angle = (slotIndex - 1) * ((2 * Math.PI) / 6);
        offsetX = Math.cos(angle) * spacing;
        offsetY = Math.sin(angle) * spacing;
      } else if (slotIndex <= 18) {
        const angle = (slotIndex - 7) * ((2 * Math.PI) / 12);
        offsetX = Math.cos(angle) * (spacing * 2);
        offsetY = Math.sin(angle) * (spacing * 2);
      } else {
        const angle = (slotIndex - 19) * ((2 * Math.PI) / 18);
        offsetX = Math.cos(angle) * (spacing * 3);
        offsetY = Math.sin(angle) * (spacing * 3);
      }
    }

    const targetX = Math.round(centerTile.x + offsetX);
    const targetY = Math.round(centerTile.y + offsetY);

    // SPEC S4: Yuva yürünemez kareye denk gelirse en yakın yürünebilir kareye kaydırılır
    const walkable = this.pathfinding.findNearestWalkableTile({ x: targetX, y: targetY });
    return walkable ? walkable : centerTile;
  }

  private applySoldierPhaseBehavior(soldier: Unit, phase: MatchPhase, slotIndex: number = 0): void {
    if (soldier.state === 'dead') return;

    if (phase === 'prep') {
      // SPEC S4 'prep': askerler toplanma noktası etrafında ayrı yuvalara yerleşir
      const rallyCenter = this.rallyPoints[soldier.team];
      const slotTile = this.getSlotTargetTile(rallyCenter, slotIndex);
      const dist = Math.hypot(
        soldier.pos.x - (slotTile.x + 0.5),
        soldier.pos.y - (slotTile.y + 0.5)
      );

      if (dist > 0.8 && soldier.state !== 'moving') {
        const path = this.pathfinding.findPath(
          { x: Math.floor(soldier.pos.x), y: Math.floor(soldier.pos.y) },
          slotTile
        );
        if (path && path.length > 0) {
          soldier.setPath(path);
        }
      }
    } else if (phase === 'march') {
      // SPEC S4 'march': bütün askerler ortak alanda ayrı yuvalara yerleşir
      const slotTile = this.getSlotTargetTile(this.commonAreaCenterTile, slotIndex);
      const dist = Math.hypot(
        soldier.pos.x - (slotTile.x + 0.5),
        soldier.pos.y - (slotTile.y + 0.5)
      );

      if (dist > 0.8 && soldier.state !== 'moving') {
        const path = this.pathfinding.findPath(
          { x: Math.floor(soldier.pos.x), y: Math.floor(soldier.pos.y) },
          slotTile
        );
        if (path && path.length > 0) {
          soldier.setPath(path);
        }
      }
    } else if (phase === 'war') {
      // SPEC S4 'war': hedef seçimi aktiftir
      // Eğer birimin o an aktif bir hedefi varsa CombatManager onu zaten yönlendirir
      const targetSelector = this.combatManager.getTargetSelector();
      const currentTarget = targetSelector.selectTarget(soldier, [], [], 0);

      if (!currentTarget) {
        // Hedef yokken:
        if (soldier.mode === 'attack') {
          // 'attack' ise hedef yokken düşman ana karargâhına doğru ilerler
          if (soldier.state !== 'moving') {
            const enemyTeam: Team = soldier.team === 'player' ? 'enemy' : 'player';
            const enemyHqTile = enemyTeam === 'player' ? this.map.playerStart : this.map.enemyStart;
            const enemyHqRect = { x: enemyHqTile.x, y: enemyHqTile.y, w: 6, h: 6 };

            const path = this.pathfinding.findPathToRect(
              { x: Math.floor(soldier.pos.x), y: Math.floor(soldier.pos.y) },
              enemyHqRect,
              1
            );
            if (path && path.length > 0) {
              soldier.setPath(path);
            }
          }
        } else {
          // 'waiting' ise yerinde bekler
          if (soldier.state === 'moving') {
            soldier.setPath([]);
          }
          soldier.state = 'idle';
        }
      }
    }
  }

  private initPoints(): void {
    const teams: Team[] = ['player', 'enemy'];
    const caCenter = this.map.getCommonAreaCenter();
    const nearestCa = this.pathfinding.findNearestWalkableTile({
      x: Math.round(caCenter.x),
      y: Math.round(caCenter.y),
    });
    this.commonAreaCenterTile = nearestCa ? nearestCa : { x: Math.round(caCenter.x), y: Math.round(caCenter.y) };

    for (const team of teams) {
      // Toplanma noktası: takımın ana karargâh merkezi ile ortak alan merkezini birleştiren doğru üzerinde,
      // karargâh merkezinden MATCH_RULES.rallyDistance (10) kare ileride, en yakın yürünebilir kare [EK]
      const hqCenter = this.map.getHqCenter(team);
      const dx = caCenter.x - hqCenter.x;
      const dy = caCenter.y - hqCenter.y;
      const len = Math.hypot(dx, dy) || 1;

      const rallyX = hqCenter.x + (dx / len) * MATCH_RULES.rallyDistance;
      const rallyY = hqCenter.y + (dy / len) * MATCH_RULES.rallyDistance;

      const walkable = this.pathfinding.findNearestWalkableTile({
        x: Math.round(rallyX),
        y: Math.round(rallyY),
      });

      this.rallyPoints[team] = walkable
        ? walkable
        : { x: Math.round(rallyX), y: Math.round(rallyY) };
    }
  }

  public getRallyPoint(team: Team): TilePos {
    return this.rallyPoints[team];
  }

  public getCommonAreaCenterTile(): TilePos {
    return this.commonAreaCenterTile;
  }
}
