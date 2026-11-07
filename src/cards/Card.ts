import { BUILDINGS } from '../data/buildings';
import { CARDS } from '../data/cards';
import { BuildingId, CardDef, CardId, UnitId } from '../types';

// SPEC S1: getCard(id)
export function getCard(id: CardId): CardDef | undefined {
  return CARDS[id];
}

// SPEC S1: getCardForUnit(unitId) - İşçiler kart değildir
export function getCardForUnit(unitId: UnitId): CardDef | undefined {
  if (unitId === 'altin_madencisi' || unitId === 'oduncu') {
    return undefined;
  }

  for (const card of Object.values(CARDS)) {
    if (card.refType === 'unit' && card.refId === unitId) {
      return card;
    }
  }

  return undefined;
}

// SPEC S1: getCardForBuilding(buildingId)
export function getCardForBuilding(buildingId: BuildingId): CardDef | undefined {
  // 1. Doğrudan bina referanslı kartlar (Hisar, Mancınık-ı Azam)
  for (const card of Object.values(CARDS)) {
    if (card.refType === 'building' && card.refId === buildingId) {
      return card;
    }
  }

  // 2. Üretim binaları için, o binada üretilen birimin kartı
  const bDef = BUILDINGS[buildingId];
  if (bDef && bDef.produces && bDef.produces.length > 0) {
    for (const unitId of bDef.produces) {
      const card = getCardForUnit(unitId);
      if (card) return card;
    }
  }

  return undefined;
}
