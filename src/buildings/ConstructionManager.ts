import { EventManager } from '../core/EventManager';
import { BUILDINGS } from '../data/buildings';
import { CARDS } from '../data/cards';
import { MATCH_RULES } from '../data/matchRules';
import { BuildingId, CardId, Team, TilePos } from '../types';
import { ModifierRegistry } from '../units/UnitStats';
import { GameMap } from '../world/MapConfig';
import { Building } from './Building';
import { BuildingManager } from './BuildingManager';
import { ResourceManager } from '../economy/ResourceManager';

export type PlaceFailureReason =
  | 'card_not_available'
  | 'limit'
  | 'not_enough_resources'
  | 'not_in_zone'
  | 'terrain'
  | 'overlap'
  | 'out_of_bounds';

export type PlaceGeneralReason = PlaceFailureReason;

export interface TileValidityDetail {
  x: number;
  y: number;
  isValid: boolean;
  reason?: 'out_of_bounds' | 'not_in_zone' | 'terrain' | 'overlap';
}

export interface BuildingPlacementValidity {
  isValid: boolean;
  generalReason?: PlaceGeneralReason;
  reasonText?: string;
  tiles: TileValidityDetail[];
}

export interface CanPlaceResult {
  ok: boolean;
  reason?: PlaceFailureReason;
}

export class ConstructionManager {
  private cardAvailabilityProvider: ((team: Team, cardId: CardId) => boolean) | null = null;

  constructor(
    private map: GameMap,
    private buildingManager: BuildingManager,
    private resourceManager: ResourceManager,
    private modifierRegistry?: ModifierRegistry,
    private eventManager?: EventManager
  ) {}

  public getMap(): GameMap {
    return this.map;
  }

  // SPEC S3: Kare bazlı uygunluk sorgusu için salt-okur fonksiyon
  public getTileValidity(
    team: Team,
    buildingId: BuildingId,
    tile: TilePos
  ): BuildingPlacementValidity {
    const def = BUILDINGS[buildingId];
    if (!def || buildingId === 'hq') {
      return {
        isValid: false,
        generalReason: 'card_not_available',
        reasonText: 'Kullanılamaz',
        tiles: [],
      };
    }

    // Kart kullanılabilirlik kontrolü
    if (this.cardAvailabilityProvider) {
      const cardId = this.getCardIdForBuilding(buildingId);
      if (!cardId || !this.cardAvailabilityProvider(team, cardId)) {
        return {
          isValid: false,
          generalReason: 'card_not_available',
          reasonText: 'Kart kullanılamaz',
          tiles: [],
        };
      }
    }

    // Sınır kontrolü: BUILDINGS[id].maxCount
    const activeBuildings = this.buildingManager
      .getBuildingsOfType(team, buildingId)
      .filter((b) => b.state !== 'destroyed');
    const isLimitReached = activeBuildings.length >= def.maxCount;

    // Bedel kontrolü
    const canAfford = this.resourceManager.canAfford(team, def.costGold, def.costWood);

    const w = def.footprint.w;
    const h = def.footprint.h;
    const allBuildings = this.buildingManager
      .getBuildings()
      .filter((b) => b.state !== 'destroyed');

    const tiles: TileValidityDetail[] = [];
    let hasOutOfBounds = false;
    let hasNotInZone = false;
    let hasTerrainInvalid = false;
    let hasOverlap = false;

    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const tx = tile.x + dx;
        const ty = tile.y + dy;

        // 1. Harita dışı
        if (!this.map.inBounds(tx, ty)) {
          tiles.push({ x: tx, y: ty, isValid: false, reason: 'out_of_bounds' });
          hasOutOfBounds = true;
          continue;
        }

        // 2. Bölge dışı
        const centerX = tx + 0.5;
        const centerY = ty + 0.5;
        if (!this.map.isInPlayerZone(team, centerX, centerY)) {
          tiles.push({ x: tx, y: ty, isValid: false, reason: 'not_in_zone' });
          hasNotInZone = true;
          continue;
        }

        // 3. Zemin kontrolü
        if (!this.map.isBuildable(tx, ty)) {
          tiles.push({ x: tx, y: ty, isValid: false, reason: 'terrain' });
          hasTerrainInvalid = true;
          continue;
        }

        // 4. Çakışma kontrolü
        let tileOverlap = false;
        for (const b of allBuildings) {
          const rect = b.getRect();
          if (tx >= rect.x && tx < rect.x + rect.w && ty >= rect.y && ty < rect.y + rect.h) {
            tileOverlap = true;
            break;
          }
        }

        if (tileOverlap) {
          tiles.push({ x: tx, y: ty, isValid: false, reason: 'overlap' });
          hasOverlap = true;
          continue;
        }

        tiles.push({ x: tx, y: ty, isValid: true });
      }
    }

    // SPEC S3: Her kare kendi uygunluk rengini alır.
    // Binanın genel durumu ise tüm şartlar sağlandığında uygundur.
    const allTilesValid = tiles.length > 0 && tiles.every((t) => t.isValid);
    const overallValid = allTilesValid && !isLimitReached && canAfford;

    let generalReason: PlaceGeneralReason | undefined = undefined;
    let reasonText: string | undefined = undefined;

    // SPEC S5: Açıklayıcı ipucu metni
    if (!overallValid) {
      if (isLimitReached) {
        generalReason = 'limit';
        reasonText = 'Sınıra ulaşıldı';
      } else if (!canAfford) {
        generalReason = 'not_enough_resources';
        reasonText = 'Kaynak yetersiz';
      } else if (hasOutOfBounds) {
        generalReason = 'out_of_bounds';
        reasonText = 'Harita dışı';
      } else if (hasNotInZone) {
        generalReason = 'not_in_zone';
        reasonText = 'Bölge dışı';
      } else if (hasOverlap) {
        generalReason = 'overlap';
        reasonText = 'Başka yapıyla çakışıyor';
      } else if (hasTerrainInvalid) {
        generalReason = 'terrain';
        reasonText = 'Zemin uygun değil';
      }
    }

    return {
      isValid: overallValid,
      generalReason,
      reasonText,
      tiles,
    };
  }

  // SPEC S1: setCardAvailabilityProvider(fonksiyon(team, cardId) -> boolean)
  public setCardAvailabilityProvider(
    provider: (team: Team, cardId: CardId) => boolean
  ): void {
    this.cardAvailabilityProvider = provider;
  }

  // SPEC S1: canPlace(team, buildingId, tile) -> { ok, reason }
  public canPlace(
    team: Team,
    buildingId: BuildingId,
    tile: TilePos
  ): CanPlaceResult {
    // 1. Ana karargâh (hq) yerleştirilemez (otomatiktir)
    if (buildingId === 'hq') {
      return { ok: false, reason: 'card_not_available' };
    }

    const def = BUILDINGS[buildingId];
    if (!def) {
      return { ok: false, reason: 'card_not_available' };
    }

    // 2. Kart kullanılabilirlik kontrolü
    if (this.cardAvailabilityProvider) {
      const cardId = this.getCardIdForBuilding(buildingId);
      if (!cardId || !this.cardAvailabilityProvider(team, cardId)) {
        return { ok: false, reason: 'card_not_available' };
      }
    }

    // 3. Sınır kontrolü: BUILDINGS[id].maxCount (inşaat halindekiler de sayılır)
    const activeBuildings = this.buildingManager
      .getBuildingsOfType(team, buildingId)
      .filter((b) => b.state !== 'destroyed');
    if (activeBuildings.length >= def.maxCount) {
      return { ok: false, reason: 'limit' };
    }

    // 4. Bedel kontrolü: BUILDINGS verisinden altın ve odun
    if (!this.resourceManager.canAfford(team, def.costGold, def.costWood)) {
      return { ok: false, reason: 'not_enough_resources' };
    }

    const w = def.footprint.w;
    const h = def.footprint.h;

    // 5. Harita sınırları kontrolü
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const tx = tile.x + dx;
        const ty = tile.y + dy;
        if (!this.map.inBounds(tx, ty)) {
          return { ok: false, reason: 'out_of_bounds' };
        }
      }
    }

    // 6. Bölge kontrolü: binanın bütün karelerinin merkezi GameMap.isInPlayerZone içinde olmalı [EK]
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const centerX = tile.x + dx + 0.5;
        const centerY = tile.y + dy + 0.5;
        if (!this.map.isInPlayerZone(team, centerX, centerY)) {
          return { ok: false, reason: 'not_in_zone' };
        }
      }
    }

    // 7. Zemin kontrolü: bütün kareler isBuildable (flat) olmalı. Dağ, nehir, kayalık, orman, geçit engeller
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const tx = tile.x + dx;
        const ty = tile.y + dy;
        if (!this.map.isBuildable(tx, ty)) {
          return { ok: false, reason: 'terrain' };
        }
      }
    }

    // 8. Çakışma kontrolü: başka bina, ana karargâh ve kaynak noktası karelerinin üstüne yerleştirilemez
    const candidateRect = { x: tile.x, y: tile.y, w, h };
    const allBuildings = this.buildingManager
      .getBuildings()
      .filter((b) => b.state !== 'destroyed');

    for (const b of allBuildings) {
      const bRect = b.getRect();
      if (this.rectsOverlap(candidateRect, bRect)) {
        return { ok: false, reason: 'overlap' };
      }
    }

    return { ok: true };
  }

  // SPEC S2: place(team, buildingId, tile)
  public place(team: Team, buildingId: BuildingId, tile: TilePos): Building | null {
    const check = this.canPlace(team, buildingId, tile);
    if (!check.ok) {
      return null;
    }

    const def = BUILDINGS[buildingId];

    // SPEC S2: Bedel YERLEŞTİRME ANINDA ödenir [EK]
    const spent = this.resourceManager.spend(team, def.costGold, def.costWood);
    if (!spent) {
      return null;
    }

    // SPEC S2: Bina 'constructing' durumunda oluşur, kareler yürünemez olur
    const building = this.buildingManager.spawnBuilding(
      buildingId,
      team,
      tile,
      'constructing'
    );

    // Başlangıç canı: maxHp x constructionStartHpFraction
    const startFraction = MATCH_RULES.constructionStartHpFraction;
    building.constructionProgress = 0;
    building.hp = Math.max(1, Math.round(building.maxHp * startFraction));

    return building;
  }

  // SPEC S2 & S7: Otomatik inşaat ilerlemesi (yalnızca simülasyon dt'sine bağlı)
  public update(dt: number): void {
    const buildings = this.buildingManager.getBuildings();

    for (const building of buildings) {
      if (building.state !== 'constructing') continue;

      const def = BUILDINGS[building.defId];
      const baseBuildTime = def.buildTimeSec;

      // Etkin inşaat süresi (UnitStats structureBuildTime yüzdeleri uygulanır)
      const effectiveBuildTime = this.modifierRegistry
        ? this.modifierRegistry.getBuildingStat(building, 'structureBuildTime')
        : baseBuildTime;

      if (effectiveBuildTime <= 0) {
        building.constructionProgress = 1.0;
      } else {
        const dProgress = dt / effectiveBuildTime;
        building.constructionProgress = Math.min(1.0, building.constructionProgress + dProgress);

        // Can: hp = maxHp x (startFraction + (1 - startFraction) x progress)
        const startFraction = MATCH_RULES.constructionStartHpFraction;
        const dHp = building.maxHp * (1 - startFraction) * dProgress;
        building.hp = Math.min(building.maxHp, building.hp + dHp);
      }

      // İnşaat tamamlanınca
      if (building.constructionProgress >= 1.0) {
        building.state = 'active';
        building.constructionProgress = 1.0;
        building.hp = Math.min(building.maxHp, Math.round(building.hp));

        if (this.eventManager) {
          this.eventManager.emit('buildingCompleted', { building });
        }
      }
    }
  }

  // SPEC S6: Kalan simülasyon saniyesi okuma fonksiyonu
  public getRemainingSimSec(building: Building): number {
    if (building.state !== 'constructing') return 0;
    const def = BUILDINGS[building.defId];
    if (!def) return 0;
    const baseBuildTime = def.buildTimeSec;
    const effectiveBuildTime = this.modifierRegistry
      ? this.modifierRegistry.getBuildingStat(building, 'structureBuildTime')
      : baseBuildTime;
    if (effectiveBuildTime <= 0) return 0;
    const remainingFraction = Math.max(0, 1 - building.constructionProgress);
    return effectiveBuildTime * remainingFraction;
  }

  // Üretim binaları ve savunma yapıları için kart eşleşmesi
  private getCardIdForBuilding(buildingId: BuildingId): CardId | null {
    // 1. Savunma yapıları için kendi kartı
    if (buildingId === 'hisar' || buildingId === 'mancinik_i_azam') {
      return buildingId as CardId;
    }

    // 2. Üretim binaları için, o binada üretilen birimin kartı
    for (const card of Object.values(CARDS)) {
      if (card.refType === 'unit') {
        const unitDef = card.refId;
        // BUILDINGS[buildingId].produces içinde bu birim var mı?
        const bDef = BUILDINGS[buildingId];
        if (bDef && bDef.produces.includes(unitDef as any)) {
          return card.id;
        }
      }
    }

    return null;
  }

  private rectsOverlap(
    r1: { x: number; y: number; w: number; h: number },
    r2: { x: number; y: number; w: number; h: number }
  ): boolean {
    return (
      r1.x < r2.x + r2.w &&
      r1.x + r1.w > r2.x &&
      r1.y < r2.y + r2.h &&
      r1.y + r1.h > r2.y
    );
  }
}
