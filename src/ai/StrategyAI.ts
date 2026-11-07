import { BuildingManager } from '../buildings/BuildingManager';
import { ConstructionManager } from '../buildings/ConstructionManager';
import { ProductionManager } from '../buildings/ProductionManager';
import { BUILDINGS } from '../data/buildings';
import { CARDS } from '../data/cards';
import { MATCH_RULES } from '../data/matchRules';
import { UNITS } from '../data/units';
import { ResourceManager } from '../economy/ResourceManager';
import { BuildingId, CardId, DifficultyDef, Team, TilePos, UnitId } from '../types';
import { GameMap } from '../world/MapConfig';

export class StrategyAI {
  private lastSoldierIndex: number = 0;

  constructor(
    private team: Team,
    private difficulty: DifficultyDef,
    private enemyCardIds: CardId[],
    private buildingManager: BuildingManager,
    private constructionManager: ConstructionManager,
    private productionManager: ProductionManager,
    private resourceManager: ResourceManager,
    private map: GameMap
  ) {}

  // SPEC S4: StrategyAI
  // Tur içi öncelik: a (bina eksikse), sonra b (savunma), sonra c (asker).
  // Bir turda en fazla BİR eylem yapar.
  public execute(): boolean {
    // 1. a) Üretim binası kontrolü
    if (this.executeProductionBuildingStep()) {
      return true;
    }

    // 2. b) Savunma yapıları kontrolü
    if (this.executeDefenseBuildingStep()) {
      return true;
    }

    // 3. c) Asker üretimi kontrolü
    if (this.executeSoldierProductionStep()) {
      return true;
    }

    return false;
  }

  // SPEC S4 a: Üretim binası
  // enemyCardIds içindeki ASKER kartlarını liste sırasıyla dolaş;
  // üretim binası henüz yoksa (inşaat halindekiler dahil) ve bedeli karşılanabiliyorsa o binayı kur.
  // Yer: takımın kendi bölgesinde canPlace sonucu ok olan, ana karargâh merkezine en yakın ilk kare (merkezden uzağa tara).
  private executeProductionBuildingStep(): boolean {
    for (const cardId of this.enemyCardIds) {
      const card = CARDS[cardId];
      if (!card || card.category !== 'asker' || card.refType !== 'unit') continue;

      const unitId = card.refId as UnitId;
      const uDef = UNITS[unitId];
      if (!uDef) continue;

      const buildingId = uDef.producedAt;

      // Üretim binası henüz yoksa (inşaat halindekiler dahil)
      const existing = this.buildingManager
        .getBuildingsOfType(this.team, buildingId)
        .filter((b) => b.state !== 'destroyed');

      if (existing.length === 0) {
        const bDef = BUILDINGS[buildingId];
        if (this.resourceManager.canAfford(this.team, bDef.costGold, bDef.costWood)) {
          const tile = this.findBestPlacementTile(buildingId);
          if (tile) {
            const placed = this.constructionManager.place(this.team, buildingId, tile);
            if (placed) {
              return true; // En fazla 1 eylem tamamlandı
            }
          }
        }
      }
    }

    return false;
  }

  // SPEC S4 b: Savunma
  // Hisar kartı varsa hedef Hisar sayısı: Kolay 0, Normal 0, Zor 3, Cehennem 6;
  // Mancınık-ı Azam kartı varsa hedef sayı: Zor 1, Cehennem 3 (Kolay ve Normal'de bu kartlar yoktur).
  // Mevcut sayı hedefin altındaysa ve bedel yeterliyse bir tane kur.
  private executeDefenseBuildingStep(): boolean {
    let targetHisar = 0;
    let targetMancinik = 0;

    if (this.difficulty.id === 'zor') {
      targetHisar = 3;
      targetMancinik = 1;
    } else if (this.difficulty.id === 'cehennem') {
      targetHisar = 6;
      targetMancinik = 3;
    }

    // Hisar kontrolü
    if (this.enemyCardIds.includes('hisar') && targetHisar > 0) {
      const currentHisar = this.buildingManager
        .getBuildingsOfType(this.team, 'hisar')
        .filter((b) => b.state !== 'destroyed').length;

      if (currentHisar < targetHisar) {
        const def = BUILDINGS.hisar;
        if (this.resourceManager.canAfford(this.team, def.costGold, def.costWood)) {
          const tile = this.findBestPlacementTile('hisar');
          if (tile) {
            const placed = this.constructionManager.place(this.team, 'hisar', tile);
            if (placed) {
              return true;
            }
          }
        }
      }
    }

    // Mancınık-ı Azam kontrolü
    if (this.enemyCardIds.includes('mancinik_i_azam') && targetMancinik > 0) {
      const currentMancinik = this.buildingManager
        .getBuildingsOfType(this.team, 'mancinik_i_azam')
        .filter((b) => b.state !== 'destroyed').length;

      if (currentMancinik < targetMancinik) {
        const def = BUILDINGS.mancinik_i_azam;
        if (this.resourceManager.canAfford(this.team, def.costGold, def.costWood)) {
          const tile = this.findBestPlacementTile('mancinik_i_azam');
          if (tile) {
            const placed = this.constructionManager.place(this.team, 'mancinik_i_azam', tile);
            if (placed) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  // SPEC S4 c: Asker
  // Üretim binası aktif olan asker kartlarını sırayla döngüsel olarak seç;
  // kuyruğu MATCH_RULES.queueMax'tan kısa ilk uygun binaya 1 birim ekle (enqueue koşulları geçerliyse).
  private executeSoldierProductionStep(): boolean {
    const soldierCards = this.enemyCardIds.filter((cid) => {
      const c = CARDS[cid];
      return c && c.category === 'asker' && c.refType === 'unit';
    });

    if (soldierCards.length === 0) {
      return false;
    }

    for (let i = 0; i < soldierCards.length; i++) {
      const cIndex = (this.lastSoldierIndex + i) % soldierCards.length;
      const cardId = soldierCards[cIndex];
      const card = CARDS[cardId];
      const unitId = card.refId as UnitId;
      const buildingId = UNITS[unitId].producedAt;

      // Üretim binası 'active' olanları bul
      const activeBuildings = this.buildingManager
        .getBuildingsOfType(this.team, buildingId)
        .filter((b) => b.state === 'active');

      for (const b of activeBuildings) {
        const queue = this.productionManager.getQueue(b);
        if (queue.length < MATCH_RULES.queueMax) {
          const uDef = UNITS[unitId];
          if (this.resourceManager.canAfford(this.team, uDef.costGold, uDef.costWood)) {
            const enqueued = this.productionManager.enqueue(this.team, b, unitId);
            if (enqueued) {
              this.lastSoldierIndex = (cIndex + 1) % soldierCards.length;
              return true; // En fazla 1 eylem tamamlandı
            }
          }
        }
      }
    }

    return false;
  }

  // SPEC S4: Yer: takımın kendi bölgesinde canPlace sonucu ok olan, ana karargâh merkezine en yakın ilk kare (kareleri merkezden uzağa doğru tara)
  private findBestPlacementTile(buildingId: BuildingId): TilePos | null {
    const hqCenter = this.map.getHqCenter(this.team);
    const bDef = BUILDINGS[buildingId];
    if (!bDef) return null;

    const w = bDef.footprint.w;
    const h = bDef.footprint.h;
    const radius = MATCH_RULES.placementZoneRadius;

    const minX = Math.max(0, Math.floor(hqCenter.x - radius));
    const maxX = Math.min(this.map.width - w, Math.ceil(hqCenter.x + radius));
    const minY = Math.max(0, Math.floor(hqCenter.y - radius));
    const maxY = Math.min(this.map.height - h, Math.ceil(hqCenter.y + radius));

    const candidates: Array<{ pos: TilePos; distSq: number }> = [];

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const centerX = x + w / 2;
        const centerY = y + h / 2;
        const dx = centerX - hqCenter.x;
        const dy = centerY - hqCenter.y;
        const distSq = dx * dx + dy * dy;

        if (distSq <= radius * radius) {
          candidates.push({ pos: { x, y }, distSq });
        }
      }
    }

    // Merkezden uzağa doğru sırala (eşitlikte deterministik y, sonra x)
    candidates.sort((a, b) => {
      if (Math.abs(a.distSq - b.distSq) > 0.001) {
        return a.distSq - b.distSq;
      }
      if (a.pos.y !== b.pos.y) {
        return a.pos.y - b.pos.y;
      }
      return a.pos.x - b.pos.x;
    });

    for (const item of candidates) {
      const res = this.constructionManager.canPlace(this.team, buildingId, item.pos);
      if (res.ok) {
        return item.pos;
      }
    }

    return null;
  }
}
