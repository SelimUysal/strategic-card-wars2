import { BUILDINGS } from '../data/buildings';
import { UNITS } from '../data/units';
import { BuildingId, Team, UnitId } from '../types';
import { ModifierRegistry } from '../units/UnitStats';

export interface CombatEntity {
  id: string;
  defId: UnitId | BuildingId;
  kind: 'unit' | 'building';
  team: Team;
}

export class DamageCalculator {
  // SPEC S1: son hasar = saldıranın etkin hasarı x avantaj çarpanı x (1 + hedefin damageTaken yüzdeleri toplamı)
  // Yuvarlama yok
  public static calculate(
    attacker: CombatEntity,
    target: CombatEntity,
    modifierRegistry?: ModifierRegistry
  ): number {
    // 1. Saldıranın etkin hasarı
    let baseDamage = 0;
    if (attacker.kind === 'unit') {
      const uDef = UNITS[attacker.defId as UnitId];
      baseDamage = modifierRegistry
        ? modifierRegistry.getUnitStat({ defId: attacker.defId as UnitId, team: attacker.team }, 'damage')
        : uDef ? uDef.damage : 0;
    } else {
      const bDef = BUILDINGS[attacker.defId as BuildingId];
      baseDamage = modifierRegistry
        ? modifierRegistry.getBuildingStat({ defId: attacker.defId as BuildingId, team: attacker.team }, 'damage')
        : bDef ? bDef.damage : 0;
    }

    if (baseDamage <= 0) return 0;

    // 2. Avantaj çarpanı (bonusVs listesi öncelik sırası: targetUnitId > targetTag > targetBuildings) [EK]
    const advantageMult = this.getAdvantageMultiplier(attacker, target);

    // 3. Hedefin damageTaken çarpanı (Örnek: damageTaken -0.2 ise hasar x0.8)
    let damageTakenMult = 1.0;
    if (target.kind === 'unit' && modifierRegistry) {
      damageTakenMult = modifierRegistry.getUnitStat(
        { defId: target.defId as UnitId, team: target.team },
        'damageTaken'
      );
    }

    return baseDamage * advantageMult * damageTakenMult;
  }

  private static getAdvantageMultiplier(
    attacker: CombatEntity,
    target: CombatEntity
  ): number {
    const bonusList =
      attacker.kind === 'unit'
        ? UNITS[attacker.defId as UnitId]?.bonusVs || []
        : BUILDINGS[attacker.defId as BuildingId]?.bonusVs || [];

    if (bonusList.length === 0) return 1.0;

    // 1. Öncelik: targetUnitId eşleşmesi
    if (target.kind === 'unit') {
      for (const row of bonusList) {
        if (row.targetUnitId && row.targetUnitId === target.defId) {
          return row.mult;
        }
      }

      // 2. Öncelik: targetTag eşleşmesi
      const targetTags = UNITS[target.defId as UnitId]?.tags || [];
      for (const row of bonusList) {
        if (row.targetTag && targetTags.includes(row.targetTag)) {
          return row.mult;
        }
      }
    }

    // 3. Öncelik: targetBuildings eşleşmesi
    if (target.kind === 'building') {
      for (const row of bonusList) {
        if (row.targetBuildings) {
          return row.mult;
        }
      }
    }

    return 1.0;
  }
}
