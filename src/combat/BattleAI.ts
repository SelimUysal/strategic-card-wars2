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
  private anchorPoints: Record<Team, TilePos> = {
    player: { x: 0, y: 0 },
    enemy: { x: 0, y: 0 },
  };
  private prepRallyPoints: Record<Team, TilePos> = {
    player: { x: 0, y: 0 },
    enemy: { x: 0, y: 0 },
  };
  private unitSlots: Map<string, TilePos> = new Map();
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

    // SPEC S5: Yeni üretilen asker, o anki evrenin davranışını uygular
    if (this.eventManager) {
      this.eventManager.on('unitSpawned', ({ unit }: { unit: Unit }) => {
        if (UNITS[unit.defId]?.tags.includes('worker')) return;
        unit.mode = unit.team === 'player' ? 'attack' : 'waiting';
        this.updateSoldierBehavior(unit, this.matchPhaseManager.getPhase());
      });
    }
  }

  // SPEC S3: Taraf testi (Side Test)
  // bir kare, takımın KENDİ tarafındadır eğer (kare - C) ile (takım karargâh merkezi - C) vektörlerinin iç çarpımı pozitifse
  public isTileOnTeamSide(team: Team, tile: TilePos): boolean {
    const caCenter = this.map.getCommonAreaCenter();
    const hqCenter = this.map.getHqCenter(team);
    const vTile = { x: tile.x + 0.5 - caCenter.x, y: tile.y + 0.5 - caCenter.y };
    const vHq = { x: hqCenter.x - caCenter.x, y: hqCenter.y - caCenter.y };
    const dot = vTile.x * vHq.x + vTile.y * vHq.y;
    return dot > 0;
  }

  // SPEC S3: Kare uygunluk testi
  // UYGUN = yürünebilir ve geçit (köprü, sığ geçit, kapı) DEĞİL ve kendi tarafında.
  public isSuitableTile(team: Team, tile: TilePos): boolean {
    if (!this.map.inBounds(tile.x, tile.y)) return false;
    if (!this.pathfinding.isWalkable(tile.x, tile.y)) return false;
    const t = this.map.getTile(tile.x, tile.y);
    if (t && t.type === 'passage') return false;
    if (!this.isTileOnTeamSide(team, tile)) return false;
    return true;
  }

  // SPEC S3: Anchor ve yuvalar için en yakın UYGUN kareyi arama
  public findNearestSuitableTile(team: Team, target: TilePos): TilePos {
    if (this.isSuitableTile(team, target)) return target;

    for (let r = 1; r <= 30; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const candidate = { x: target.x + dx, y: target.y + dy };
          if (this.isSuitableTile(team, candidate)) {
            return candidate;
          }
        }
      }
    }
    return target;
  }

  // SPEC S2 & S5(a): Anchor noktalarını hesapla
  private initPoints(): void {
    const teams: Team[] = ['player', 'enemy'];
    const caCenter = this.map.getCommonAreaCenter();

    for (const team of teams) {
      const enemyTeam: Team = team === 'player' ? 'enemy' : 'player';
      const hqSelf = this.map.getHqCenter(team);
      const hqEnemy = this.map.getHqCenter(enemyTeam);

      const dx = hqEnemy.x - hqSelf.x;
      const dy = hqEnemy.y - hqSelf.y;
      const len = Math.hypot(dx, dy) || 1;
      const u = { x: dx / len, y: dy / len };

      // S2: Bekleme çizgisi (anchor) P = C - u * (armyGap / 2)
      const halfGap = MATCH_RULES.armyGap / 2;
      const caNominal = {
        x: Math.round(caCenter.x - u.x * halfGap),
        y: Math.round(caCenter.y - u.y * halfGap),
      };
      this.anchorPoints[team] = this.findNearestSuitableTile(team, caNominal);

      // S5(a): 'prep' evresi toplanma anchor noktası
      const prepNominal = {
        x: Math.round(hqSelf.x + u.x * MATCH_RULES.rallyDistance),
        y: Math.round(hqSelf.y + u.y * MATCH_RULES.rallyDistance),
      };
      this.prepRallyPoints[team] = this.findNearestSuitableTile(team, prepNominal);
    }
  }

  // SPEC S4: Dışarıdan moda geçiş ve yuva bırakma
  public setAttackMode(unit: Unit, attack: boolean): void {
    unit.mode = attack ? 'attack' : 'waiting';
    if (attack) {
      this.unitSlots.delete(unit.id);
    }
  }

  // SPEC S5: update(dt)
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

    const teams: Team[] = ['player', 'enemy'];

    for (const team of teams) {
      const teamSoldiers = soldiers.filter((s) => s.team === team);

      // S4: Birimleri sınıflarına göre grupla
      // Class 0: Ön sıra (Yeniçeri, Deliler, Zırhlı Fil)
      const class0 = teamSoldiers.filter((s) =>
        ['yeniceri', 'deliler', 'zirhli_fil'].includes(s.defId)
      );
      // Class 1: Orta sıra (Tirendaz / Okçular)
      const class1 = teamSoldiers.filter((s) => s.defId === 'tirendaz');
      // Class 2: Arka sıra (Şahi, Fetih Gemisi)
      const class2 = teamSoldiers.filter((s) =>
        ['sahi', 'fetih_gemisi'].includes(s.defId)
      );

      this.updateTeamClassFormation(team, class0, 0, phase);
      this.updateTeamClassFormation(team, class1, 1, phase);
      this.updateTeamClassFormation(team, class2, 2, phase);

      if (phase === 'war') {
        const attackSoldiers = teamSoldiers.filter((s) => s.mode === 'attack');
        for (const s of attackSoldiers) {
          this.applyWarAttackBehavior(s);
        }
      }
    }
  }

  private updateSoldierBehavior(soldier: Unit, phase: MatchPhase): void {
    if (soldier.state === 'dead') return;
    if (phase === 'war' && soldier.mode === 'attack') {
      this.applyWarAttackBehavior(soldier);
    }
  }

  // SPEC S4: Sınıf bazlı dizilim ve yuva yerleşimi
  private updateTeamClassFormation(
    team: Team,
    units: Unit[],
    classIndex: number,
    phase: MatchPhase
  ): void {
    if (units.length === 0) return;

    // Deterministik sıralama (ID bazlı)
    units.sort((a, b) => a.id.localeCompare(b.id));

    const enemyTeam: Team = team === 'player' ? 'enemy' : 'player';
    const hqSelf = this.map.getHqCenter(team);
    const hqEnemy = this.map.getHqCenter(enemyTeam);

    const dx = hqEnemy.x - hqSelf.x;
    const dy = hqEnemy.y - hqSelf.y;
    const len = Math.hypot(dx, dy) || 1;
    const u = { x: dx / len, y: dy / len };
    const v = { x: -u.y, y: u.x }; // DİK doğrultu (yan yana dizilim)

    const anchor = phase === 'prep' ? this.prepRallyPoints[team] : this.anchorPoints[team];

    let baseDepth = 0;
    if (classIndex === 1) {
      baseDepth = MATCH_RULES.armyArcherDepth; // 3
    } else if (classIndex === 2) {
      baseDepth = MATCH_RULES.armyArcherDepth + MATCH_RULES.armyArtilleryDepth; // 3 + 5 = 8
    }

    for (let i = 0; i < units.length; i++) {
      const unit = units[i];

      // S5(c): 'war' evresinde 'attack' modundaki birimler yuvayı bırakır
      if (phase === 'war' && unit.mode === 'attack') {
        this.unitSlots.delete(unit.id);
        continue;
      }

      const rowIdx = Math.floor(i / MATCH_RULES.armyMaxColumns);
      const colIdx = i % MATCH_RULES.armyMaxColumns;

      // Alternatif simetrik sütun ofseti (0, +1, -1, +2, -2...)
      const colOffset =
        (colIdx % 2 === 1 ? Math.ceil(colIdx / 2) : -colIdx / 2) *
        MATCH_RULES.rallySlotSpacing;
      const depth = baseDepth + rowIdx * MATCH_RULES.rallySlotSpacing;

      const rowCenterX = anchor.x - u.x * depth;
      const rowCenterY = anchor.y - u.y * depth;

      const nominalX = Math.round(rowCenterX + v.x * colOffset);
      const nominalY = Math.round(rowCenterY + v.y * colOffset);

      const slotTile = this.findNearestSuitableTile(team, { x: nominalX, y: nominalY });
      this.unitSlots.set(unit.id, slotTile);

      const dist = Math.hypot(
        unit.pos.x - (slotTile.x + 0.5),
        unit.pos.y - (slotTile.y + 0.5)
      );

      if (dist > 0.8 && unit.state !== 'moving') {
        const path = this.pathfinding.findPath(
          { x: Math.floor(unit.pos.x), y: Math.floor(unit.pos.y) },
          slotTile
        );
        if (path && path.length > 0) {
          unit.setPath(path);
        }
      }
    }
  }

  // SPEC S5(c): 'war' evresinde 'attack' modundaki askerlerin saldırı davranışı
  private applyWarAttackBehavior(soldier: Unit): void {
    if (soldier.state === 'dead') return;

    const targetSelector = this.combatManager.getTargetSelector();
    const currentTarget = targetSelector.selectTarget(soldier, [], [], 0);

    if (!currentTarget) {
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
    }
  }

  public getAnchorPoint(team: Team): TilePos {
    return this.anchorPoints[team];
  }

  public getRallyPoint(team: Team): TilePos {
    return this.prepRallyPoints[team];
  }

  public getCommonAreaCenterTile(): TilePos {
    return this.map.getCommonAreaCenter();
  }
}
