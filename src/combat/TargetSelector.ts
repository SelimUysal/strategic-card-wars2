import { BUILDINGS } from '../data/buildings';
import { UNITS } from '../data/units';
import { TargetCategory, Targeting } from '../types';
import { Building } from '../buildings/Building';
import { Unit } from '../units/Unit';

export type TargetableEntity = Unit | Building;

export class TargetSelector {
  // Hedef sorgusu için son yenileme zamanlarını tutan eşleme
  private targetTimers: Map<string, number> = new Map();
  private currentTargets: Map<string, string | null> = new Map();

  // SPEC S2: selectTarget(attacker, enemyUnits, enemyBuildings, dt)
  public selectTarget(
    attacker: TargetableEntity,
    enemyUnits: Unit[],
    enemyBuildings: Building[],
    dt: number = 0
  ): TargetableEntity | null {
    // 1. Hedef yenileme süresi kontrolü (simülasyon saniyesinde en fazla 1 kez; hedef ölünce hemen yeniler)
    const timer = (this.targetTimers.get(attacker.id) || 0) + dt;
    this.targetTimers.set(attacker.id, timer);

    const currentTargetId = this.currentTargets.get(attacker.id);
    let existingTarget: TargetableEntity | null = null;

    if (currentTargetId) {
      existingTarget =
        enemyUnits.find((u) => u.id === currentTargetId && u.state !== 'dead') ||
        enemyBuildings.find((b) => b.id === currentTargetId && b.state !== 'destroyed') ||
        null;
    }

    // Eğer mevcut hedef canlıysa ve henüz 1 saniyelik yenileme süresi dolmadıysa aynı hedefi koru
    if (existingTarget && timer < 1.0) {
      // Görüş menzilinde ve minRange dışında mı kontrol et
      const dist = this.getDistance(attacker, existingTarget);
      const vision = this.getVision(attacker);
      const minRange = this.getMinRange(attacker);
      if (dist <= vision && dist >= minRange) {
        return existingTarget;
      }
    }

    // Hedefi yeniden ara
    this.targetTimers.set(attacker.id, 0);

    const targeting = this.getTargeting(attacker);
    if (!targeting) {
      this.currentTargets.set(attacker.id, null);
      return null;
    }

    const vision = this.getVision(attacker);
    const minRange = this.getMinRange(attacker);

    // Görüş menzili içindeki ve minRange kısıtına uyan adayları filtrele
    const candidates: { entity: TargetableEntity; dist: number; categories: TargetCategory[] }[] = [];

    // Düşman birimler
    for (const u of enemyUnits) {
      if (u.state === 'dead' || u.team === attacker.team) continue;
      const dist = this.getDistance(attacker, u);
      if (dist <= vision && dist >= minRange) {
        candidates.push({
          entity: u,
          dist,
          categories: this.getUnitCategories(u, attacker),
        });
      }
    }

    // Düşman binalar
    for (const b of enemyBuildings) {
      if (b.state === 'destroyed' || b.team === attacker.team) continue;
      const dist = this.getDistance(attacker, b);
      if (dist <= vision && dist >= minRange) {
        candidates.push({
          entity: b,
          dist,
          categories: this.getBuildingCategories(b, attacker),
        });
      }
    }

    let selected: TargetableEntity | null = null;

    if (targeting.mode === 'ordered') {
      // 'ordered': order sırasındaki ilk dolu kategoride en yakın aday
      for (const cat of targeting.order) {
        const matches = candidates.filter((c) => c.categories.includes(cat));
        if (matches.length > 0) {
          matches.sort((a, b) => a.dist - b.dist);
          selected = matches[0].entity;
          break;
        }
      }
    } else if (targeting.mode === 'nearest') {
      // 'nearest': categories içindeki tüm adaylardan en yakın olan
      const validCategories = new Set(targeting.categories);
      const matches = candidates.filter((c) =>
        c.categories.some((cat) => validCategories.has(cat))
      );
      if (matches.length > 0) {
        matches.sort((a, b) => a.dist - b.dist);
        selected = matches[0].entity;
      }
    }

    this.currentTargets.set(attacker.id, selected ? selected.id : null);
    return selected;
  }

  public clearTarget(attackerId: string): void {
    this.currentTargets.set(attackerId, null);
    this.targetTimers.set(attackerId, 0);
  }

  // Mesafe hesabı: birimler merkezden merkeze, binalar en yakın kenara göre [EK]
  public getDistance(attacker: TargetableEntity, target: TargetableEntity): number {
    const aIsUnit = attacker.kind === 'unit';
    const tIsUnit = target.kind === 'unit';

    if (aIsUnit && tIsUnit) {
      const u1 = attacker as Unit;
      const u2 = target as Unit;
      return Math.hypot(u1.pos.x - u2.pos.x, u1.pos.y - u2.pos.y);
    }

    if (aIsUnit && !tIsUnit) {
      const u = attacker as Unit;
      const b = target as Building;
      return this.pointToRectDistance(u.pos.x, u.pos.y, b.getRect());
    }

    if (!aIsUnit && tIsUnit) {
      const b = attacker as Building;
      const u = target as Unit;
      return this.pointToRectDistance(u.pos.x, u.pos.y, b.getRect());
    }

    // Her ikisi de bina
    const b1 = attacker as Building;
    const b2 = target as Building;
    return this.rectToRectDistance(b1.getRect(), b2.getRect());
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

  private rectToRectDistance(
    r1: { x: number; y: number; w: number; h: number },
    r2: { x: number; y: number; w: number; h: number }
  ): number {
    const dx = Math.max(0, r2.x - (r1.x + r1.w), r1.x - (r2.x + r2.w));
    const dy = Math.max(0, r2.y - (r1.y + r1.h), r1.y - (r2.y + r2.h));
    return Math.hypot(dx, dy);
  }

  // SPEC S2 Kategoriler:
  // Birim: 'worker' (worker etiketi), 'archer' (archer etiketi), 'soldier' (işçi olmayan her birim; okçu hem 'archer' hem 'soldier')
  // 'attacker': saldırgana en son hasar veren düşman [EK]
  private getUnitCategories(unit: Unit, attacker: TargetableEntity): TargetCategory[] {
    const cats: TargetCategory[] = [];
    const def = UNITS[unit.defId];
    if (!def) return cats;

    if (def.tags.includes('worker')) {
      cats.push('worker');
    } else {
      cats.push('soldier');
      if (def.tags.includes('archer')) {
        cats.push('archer');
      }
    }

    if (attacker.lastAttackerId === unit.id) {
      cats.push('attacker');
    }

    return cats;
  }

  // Bina: 'defense' (kind defense), 'production' (kind production), 'hq'
  // 'attacker': saldırgana en son hasar veren düşman
  private getBuildingCategories(building: Building, attacker: TargetableEntity): TargetCategory[] {
    const cats: TargetCategory[] = [];
    const def = BUILDINGS[building.defId];
    if (!def) return cats;

    if (def.kind === 'defense') {
      cats.push('defense');
    } else if (def.kind === 'production') {
      cats.push('production');
    } else if (def.kind === 'hq') {
      cats.push('hq');
    }

    if (attacker.lastAttackerId === building.id) {
      cats.push('attacker');
    }

    return cats;
  }

  private getVision(entity: TargetableEntity): number {
    if (entity.kind === 'unit') {
      return UNITS[(entity as Unit).defId]?.vision || 6;
    }
    return BUILDINGS[(entity as Building).defId]?.vision || 10;
  }

  private getMinRange(entity: TargetableEntity): number {
    if (entity.kind === 'building') {
      return BUILDINGS[(entity as Building).defId]?.minRange || 0;
    }
    return 0;
  }

  private getTargeting(entity: TargetableEntity): Targeting | null {
    if (entity.kind === 'unit') {
      return UNITS[(entity as Unit).defId]?.targeting || null;
    }
    return BUILDINGS[(entity as Building).defId]?.targeting || null;
  }
}
