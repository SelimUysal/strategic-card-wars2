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

    for (const soldier of soldiers) {
      this.applySoldierPhaseBehavior(soldier, phase);
    }
  }

  private applySoldierPhaseBehavior(soldier: Unit, phase: MatchPhase): void {
    if (soldier.state === 'dead') return;

    if (phase === 'prep') {
      // SPEC S4 'prep': askerler toplanma noktasında bekler
      const rally = this.rallyPoints[soldier.team];
      const dist = Math.hypot(soldier.pos.x - (rally.x + 0.5), soldier.pos.y - (rally.y + 0.5));
      if (dist > 1.8 && soldier.state !== 'moving') {
        const path = this.pathfinding.findPath(
          { x: Math.floor(soldier.pos.x), y: Math.floor(soldier.pos.y) },
          rally
        );
        if (path && path.length > 0) {
          soldier.setPath(path);
        }
      }
    } else if (phase === 'march') {
      // SPEC S4 'march': bütün askerler ortak alana yürür ve orada bekler; kimse saldırmaz
      const inCommon = this.map.isInCommonArea(Math.floor(soldier.pos.x), Math.floor(soldier.pos.y));
      if (!inCommon && soldier.state !== 'moving') {
        const path = this.pathfinding.findPathToRect(
          { x: Math.floor(soldier.pos.x), y: Math.floor(soldier.pos.y) },
          this.map.commonArea,
          1
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
