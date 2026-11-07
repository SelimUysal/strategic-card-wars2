import { BUILDINGS } from '../data/buildings';
import { UNITS } from '../data/units';
import { BuildingId, EffectFilter, StatName, Team, UnitId } from '../types';

export interface StatModifier {
  source: string;
  team: Team;
  stat: StatName;
  pct: number;
  filter?: EffectFilter;
}

export class ModifierRegistry {
  private modifiers: StatModifier[] = [];
  private changeListeners: Array<() => void> = [];

  // SPEC S1: addModifier({ source, team, stat, pct, filter })
  public addModifier(mod: StatModifier): void {
    this.modifiers.push({ ...mod });
    this.notifyChanged();
  }

  // SPEC S1: removeBySource(source)
  public removeBySource(source: string): void {
    const prevCount = this.modifiers.length;
    this.modifiers = this.modifiers.filter((m) => m.source !== source);
    if (this.modifiers.length !== prevCount) {
      this.notifyChanged();
    }
  }

  // SPEC S1: clear()
  public clear(): void {
    if (this.modifiers.length > 0) {
      this.modifiers = [];
      this.notifyChanged();
    }
  }

  // Dinleyiciler: Bonus eklenince/kalkınca varlıkların maxHp'sini ve can oranını güncellemek için [EK]
  public onModifiersChanged(listener: () => void): () => void {
    this.changeListeners.push(listener);
    return () => {
      this.changeListeners = this.changeListeners.filter((l) => l !== listener);
    };
  }

  private notifyChanged(): void {
    for (const listener of this.changeListeners) {
      listener();
    }
  }

  // SPEC S1: getUnitStat(unit, stat)
  // Etkin değer = taban değer x (1 + ilgili tüm pct'lerin TOPLAMI) (yüzdeler toplanır, çarpılmaz)
  public getUnitStat(
    unit: { defId: UnitId; team: Team },
    stat: StatName
  ): number {
    const def = UNITS[unit.defId];
    if (!def) return 0;

    let baseVal = 0;
    if (stat === 'hp') baseVal = def.hp;
    else if (stat === 'damage') baseVal = def.damage;
    else if (stat === 'moveSpeed') baseVal = def.moveSpeed;
    else if (stat === 'damageTaken') baseVal = 1.0;
    else if (stat === 'gatherRate') baseVal = 1.0;
    else return 0;

    const isWorker = def.tags.includes('worker');

    let sumPct = 0;
    for (const mod of this.modifiers) {
      if (mod.team !== unit.team || mod.stat !== stat) continue;

      if (this.matchesUnitFilter(mod.filter, unit.defId, def.tags, stat, isWorker)) {
        sumPct += mod.pct;
      }
    }

    const multiplier = Math.max(0, 1 + sumPct);
    return stat === 'hp' ? Math.round(baseVal * multiplier) : baseVal * multiplier;
  }

  // SPEC S1: getBuildingStat(building, stat)
  public getBuildingStat(
    building: { defId: BuildingId; team: Team },
    stat: StatName
  ): number {
    const def = BUILDINGS[building.defId];
    if (!def) return 0;

    let baseVal = 0;
    if (stat === 'structureMaxHp' || stat === 'hp') baseVal = def.hp;
    else if (stat === 'structureBuildTime') baseVal = def.buildTimeSec;
    else if (stat === 'damage') baseVal = def.damage;
    else return 0;

    const isHq = def.kind === 'hq';

    let sumPct = 0;
    for (const mod of this.modifiers) {
      if (mod.team !== building.team || mod.stat !== stat) continue;

      if (this.matchesBuildingFilter(mod.filter, building.defId, stat, isHq)) {
        sumPct += mod.pct;
      }
    }

    const multiplier = Math.max(0, 1 + sumPct);
    return stat === 'structureMaxHp' || stat === 'hp'
      ? Math.round(baseVal * multiplier)
      : baseVal * multiplier;
  }

  // SPEC S1: getGatherMult(team)
  public getGatherMult(team: Team): number {
    let sumPct = 0;
    for (const mod of this.modifiers) {
      if (mod.team === team && mod.stat === 'gatherRate') {
        sumPct += mod.pct;
      }
    }
    return Math.max(0, 1 + sumPct);
  }

  private matchesUnitFilter(
    filter: EffectFilter | undefined,
    unitId: UnitId,
    tags: string[],
    stat: StatName,
    isWorker: boolean
  ): boolean {
    if (filter) {
      if (filter.unitIds && filter.unitIds.length > 0) {
        return filter.unitIds.includes(unitId);
      }
      if (filter.tags && filter.tags.length > 0) {
        return tags.some((t) => filter.tags!.includes(t as any));
      }
    }

    // SPEC S1 Kapsam:
    // hp, damage, moveSpeed, damageTaken -> o takımın askerleri (işçiler hariç)
    if (stat === 'hp' || stat === 'damage' || stat === 'moveSpeed' || stat === 'damageTaken') {
      return !isWorker;
    }

    // gatherRate -> o takımın işçileri
    if (stat === 'gatherRate') {
      return isWorker;
    }

    return false;
  }

  private matchesBuildingFilter(
    filter: EffectFilter | undefined,
    buildingId: BuildingId,
    stat: StatName,
    isHq: boolean
  ): boolean {
    // SPEC S1 Kapsam:
    // structureMaxHp -> filter.buildingIds'teki binalar
    if (stat === 'structureMaxHp') {
      if (filter && filter.buildingIds && filter.buildingIds.length > 0) {
        return filter.buildingIds.includes(buildingId);
      }
      return true;
    }

    // structureBuildTime -> o takımın üretim ve savunma binaları (ana karargâh hariç)
    if (stat === 'structureBuildTime') {
      if (isHq) return false;
      if (filter && filter.buildingIds && filter.buildingIds.length > 0) {
        return filter.buildingIds.includes(buildingId);
      }
      return true;
    }

    return true;
  }
}
