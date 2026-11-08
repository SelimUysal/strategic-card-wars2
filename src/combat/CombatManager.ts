import { EventManager } from '../core/EventManager';
import { MatchPhaseManager } from '../core/MatchPhaseManager';
import { BUILDINGS } from '../data/buildings';
import { UNITS } from '../data/units';
import { Team } from '../types';
import { Building } from '../buildings/Building';
import { BuildingManager } from '../buildings/BuildingManager';
import { Unit } from '../units/Unit';
import { UnitManager } from '../units/UnitManager';
import { ModifierRegistry } from '../units/UnitStats';
import { Pathfinding } from '../world/Pathfinding';
import { DamageCalculator } from './DamageCalculator';
import { TargetableEntity, TargetSelector } from './TargetSelector';

export class CombatManager {
  private targetSelector: TargetSelector;
  private pathUpdateTimers: Map<string, number> = new Map();

  constructor(
    private matchPhaseManager: MatchPhaseManager,
    private unitManager: UnitManager,
    private buildingManager: BuildingManager,
    private pathfinding: Pathfinding,
    private modifierRegistry?: ModifierRegistry,
    private eventManager?: EventManager
  ) {
    this.targetSelector = new TargetSelector();
  }

  public getTargetSelector(): TargetSelector {
    return this.targetSelector;
  }

  // SPEC S3 & S5: update(dt)
  public update(dt: number): void {
    // Savaş izni kontrolü (MatchPhaseManager.isCombatAllowed() false iken HİÇBİR saldırı yapılmaz)
    if (!this.matchPhaseManager.isCombatAllowed()) {
      return;
    }

    const allUnits = this.unitManager.getUnits();
    const allBuildings = this.buildingManager.getBuildings();

    // 1. Asker saldırganlar (işçi olmayan birimler)
    const soldiers = allUnits.filter(
      (u) => u.state !== 'dead' && !UNITS[u.defId]?.tags.includes('worker')
    );

    // 2. Aktif savunma yapıları (Hisar, Mancınık-ı Azam)
    const defenses = allBuildings.filter(
      (b) => b.state === 'active' && BUILDINGS[b.defId]?.kind === 'defense'
    );

    const attackers: TargetableEntity[] = [...soldiers, ...defenses];

    for (const attacker of attackers) {
      // Cooldown azaltımı
      attacker.attackCooldown = Math.max(0, attacker.attackCooldown - dt);

      // Düşman listeleri
      const enemyTeam: Team = attacker.team === 'player' ? 'enemy' : 'player';
      const enemyUnits = allUnits.filter((u) => u.team === enemyTeam && u.state !== 'dead');
      const enemyBuildings = allBuildings.filter((b) => b.team === enemyTeam && b.state !== 'destroyed');

      // Hedef seçimi (SPEC S2)
      const target = this.targetSelector.selectTarget(
        attacker,
        enemyUnits,
        enemyBuildings,
        dt
      );

      if (!target) {
        if (attacker.kind === 'unit' && (attacker as Unit).state === 'attacking') {
          (attacker as Unit).state = 'idle';
        }
        continue;
      }

      // Menzil ve mesafe kontrolü
      const range = this.getRange(attacker);
      const minRange = this.getMinRange(attacker);
      const dist = this.targetSelector.getDistance(attacker, target);

      if (dist <= range && dist >= minRange) {
        // Menzil içinde: dur ve saldırı moduna geç
        if (attacker.kind === 'unit') {
          const u = attacker as Unit;
          if (u.state === 'moving') {
            u.setPath([]);
          }
          u.state = 'attacking';

          // Hedefe doğru dön
          const targetCenter = target.getCenter();
          u.rotationY = Math.atan2(targetCenter.x - u.pos.x, targetCenter.y - u.pos.y);
        }

        // Saldırı zamanı geldiyse hasar uygula
        if (attacker.attackCooldown <= 0) {
          this.executeAttack(attacker, target, allUnits, allBuildings);
          attacker.attackCooldown = this.getAttackInterval(attacker);
        }
      } else {
        // Menzil dışındaysa: yalnızca hareketli birimler hedefe doğru yürür
        if (attacker.kind === 'unit') {
          const u = attacker as Unit;
          this.moveTowardsTarget(u, target, range, dt);
        }
      }
    }
  }

  private executeAttack(
    attacker: TargetableEntity,
    target: TargetableEntity,
    allUnits: Unit[],
    allBuildings: Building[]
  ): void {
    // R11E: Olay tabanlı efektler için 'attackPerformed' yayını (hasar mantığı veya zamanlaması değişmez)
    if (this.eventManager) {
      let attackType: 'melee' | 'arrow' | 'cannon' | 'stone' | 'ship' = 'melee';
      if (attacker.defId === 'tirendaz' || attacker.defId === 'hisar') {
        attackType = 'arrow';
      } else if (attacker.defId === 'sahi') {
        attackType = 'cannon';
      } else if (attacker.defId === 'fetih_gemisi') {
        attackType = 'ship';
      } else if (attacker.defId === 'mancinik_i_azam') {
        attackType = 'stone';
      }

      this.eventManager.emit('attackPerformed', {
        attackerId: attacker.id,
        targetId: target.id,
        attackerPos: attacker.getCenter(),
        targetPos: target.getCenter(),
        type: attackType,
      });
    }

    const isMancinik = attacker.defId === 'mancinik_i_azam';

    if (isMancinik) {
      // SPEC S3: Mancınık-ı Azam: hasar hedef noktanın splashRadius (3) çevresindeki TÜM düşman asker ve binalara uygulanır; dost hasarı yoktur [EK]
      const splashRadius = BUILDINGS['mancinik_i_azam'].splashRadius; // 3
      const targetCenter = target.getCenter();
      const enemyTeam: Team = attacker.team === 'player' ? 'enemy' : 'player';

      // 1. Ana hedefe hasar
      const primaryDmg = DamageCalculator.calculate(attacker, target, this.modifierRegistry);
      this.applyDamage(attacker, target, primaryDmg);

      // 2. Alan içindeki diğer düşman birimler
      for (const u of allUnits) {
        if (u.id === target.id || u.team !== enemyTeam || u.state === 'dead') continue;
        const d = Math.hypot(u.pos.x - targetCenter.x, u.pos.y - targetCenter.y);
        if (d <= splashRadius) {
          const splashDmg = DamageCalculator.calculate(attacker, u, this.modifierRegistry);
          this.applyDamage(attacker, u, splashDmg);
        }
      }

      // 3. Alan içindeki diğer düşman binalar
      for (const b of allBuildings) {
        if (b.id === target.id || b.team !== enemyTeam || b.state === 'destroyed') continue;
        const bRect = b.getRect();
        const d = this.pointToRectDistance(targetCenter.x, targetCenter.y, bRect);
        if (d <= splashRadius) {
          const splashDmg = DamageCalculator.calculate(attacker, b, this.modifierRegistry);
          this.applyDamage(attacker, b, splashDmg);
        }
      }
    } else {
      // Standart tekil hedef saldırısı
      const dmg = DamageCalculator.calculate(attacker, target, this.modifierRegistry);
      this.applyDamage(attacker, target, dmg);
    }
  }

  private applyDamage(
    attacker: TargetableEntity,
    target: TargetableEntity,
    damage: number
  ): void {
    const isDead = target.takeDamage(damage, attacker.id);

    if (isDead) {
      this.targetSelector.clearTarget(attacker.id);

      if (target.kind === 'unit') {
        const u = target as Unit;
        const isWorker = UNITS[u.defId]?.tags.includes('worker');

        // Birimi kaldır
        this.unitManager.removeUnit(u);

        // SPEC S3: Olaylar: 'enemySoldierKilled' ve 'friendlySoldierLost' (işçiler sayılmaz)
        if (!isWorker && this.eventManager) {
          this.eventManager.emit('enemySoldierKilled', {
            killerTeam: attacker.team,
            victim: u,
          });
          this.eventManager.emit('friendlySoldierLost', {
            team: u.team,
            unit: u,
          });
        }
      } else {
        const b = target as Building;

        // Binayı kaldır (BuildingManager yıkılınca ve hq yıkılınca olayları yönetir)
        this.buildingManager.removeBuilding(b);

        if (this.eventManager) {
          this.eventManager.emit('enemyBuildingDestroyed', {
            killerTeam: attacker.team,
            building: b,
          });
        }
      }
    }
  }

  private moveTowardsTarget(
    unit: Unit,
    target: TargetableEntity,
    range: number,
    dt: number
  ): void {
    const timer = (this.pathUpdateTimers.get(unit.id) || 0) + dt;
    this.pathUpdateTimers.set(unit.id, timer);

    // Yolu seyrek yenile (0.6 saniyede bir veya hiç yolu yoksa)
    if (unit.state !== 'moving' || timer >= 0.6) {
      this.pathUpdateTimers.set(unit.id, 0);
      const startTile = {
        x: Math.floor(unit.pos.x),
        y: Math.floor(unit.pos.y),
      };
      const path = this.pathfinding.findPathToRect(startTile, target.getRect(), Math.max(1, Math.floor(range)));
      if (path && path.length > 0) {
        unit.setPath(path);
      }
    }
  }

  private getRange(entity: TargetableEntity): number {
    if (entity.kind === 'unit') {
      return UNITS[(entity as Unit).defId]?.range || 1;
    }
    return BUILDINGS[(entity as Building).defId]?.range || 6;
  }

  private getMinRange(entity: TargetableEntity): number {
    if (entity.kind === 'building') {
      return BUILDINGS[(entity as Building).defId]?.minRange || 0;
    }
    return 0;
  }

  private getAttackInterval(entity: TargetableEntity): number {
    if (entity.kind === 'unit') {
      return UNITS[(entity as Unit).defId]?.attackIntervalSec || 1.5;
    }
    return BUILDINGS[(entity as Building).defId]?.attackIntervalSec || 2.0;
  }

  private pointToRectDistance(
    px: number,
    py: number,
    rect: { x: number; y: number; w: number; h: number }
  ): number {
    const dx = Math.max(0, rect.x - px, px - (rect.x + rect.w));
    const dy = Math.max(0, rect.y - py, py - (rect.y + rect.h));
    return Math.hypot(dx, dy);
  }
}
