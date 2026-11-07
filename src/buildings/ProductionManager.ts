import { EventManager } from '../core/EventManager';
import { BUILDINGS } from '../data/buildings';
import { MATCH_RULES } from '../data/matchRules';
import { UNITS } from '../data/units';
import { CardId, Team, TilePos, UnitId } from '../types';
import { UnitManager } from '../units/UnitManager';
import { Pathfinding } from '../world/Pathfinding';
import { Building } from './Building';
import { BuildingManager } from './BuildingManager';
import { ResourceManager } from '../economy/ResourceManager';
import { WorkerManager } from '../economy/WorkerManager';

export interface ProductionQueueItem {
  id: string;
  unitId: UnitId;
  team: Team;
  progressSec: number;
  totalSec: number;
  reservedPop: boolean;
}

export class ProductionManager {
  private queues: Map<string, ProductionQueueItem[]> = new Map();
  private nextItemId: number = 1;
  private soldiersProduced: Record<Team, number> = { player: 0, enemy: 0 };
  private cardAvailabilityProvider: ((team: Team, cardId: CardId) => boolean) | null = null;

  private buildingLookup: ((id: string) => Building | undefined) | null = null;

  constructor(
    private unitManager: UnitManager,
    private resourceManager: ResourceManager,
    private pathfinding: Pathfinding,
    private buildingManager?: BuildingManager,
    private workerManager?: WorkerManager,
    private eventManager?: EventManager
  ) {
    if (this.unitManager.setPathfinding) {
      this.unitManager.setPathfinding(this.pathfinding);
    }
  }

  public setCardAvailabilityProvider(
    provider: (team: Team, cardId: CardId) => boolean
  ): void {
    this.cardAvailabilityProvider = provider;
  }

  // SPEC S3: ProductionManager.enqueue(team, building, unitId)
  public enqueue(team: Team, building: Building, unitId: UnitId): boolean {
    // 1. Koşul: bina 'active' olmalı
    if (building.state !== 'active' || building.team !== team) {
      return false;
    }

    const bDef = BUILDINGS[building.defId];
    if (!bDef || !bDef.produces.includes(unitId)) {
      return false;
    }

    const uDef = UNITS[unitId];
    if (!uDef) {
      return false;
    }

    // 2. Koşul: asker için kart kullanılabilir olmalı
    const isWorker = uDef.tags.includes('worker');
    if (!isWorker && this.cardAvailabilityProvider) {
      const cardId = unitId as unknown as CardId;
      if (!this.cardAvailabilityProvider(team, cardId)) {
        return false;
      }
    }

    // 3. Koşul: işçi için WorkerManager.canAddWorker kontrolü
    if (isWorker && this.workerManager) {
      if (!this.workerManager.canAddWorker(team, unitId)) {
        return false;
      }
    }

    // 4. Koşul: kuyruk uzunluğu < MATCH_RULES.queueMax (5)
    const queue = this.getOrCreateQueue(building.id);
    if (queue.length >= MATCH_RULES.queueMax) {
      return false;
    }

    // 5. Koşul: bedel (altın ve odun) KUYRUĞA EKLERKEN ödenir
    if (!this.resourceManager.canAfford(team, uDef.costGold, uDef.costWood)) {
      return false;
    }

    const spent = this.resourceManager.spend(team, uDef.costGold, uDef.costWood);
    if (!spent) {
      return false;
    }

    const item: ProductionQueueItem = {
      id: `pq_${this.nextItemId++}`,
      unitId,
      team,
      progressSec: 0,
      totalSec: uDef.buildTimeSec,
      reservedPop: false,
    };

    queue.push(item);
    return true;
  }

  // SPEC S4 & S7: update(dt)
  // Süre: UNITS[unitId].buildTimeSec (simülasyon saniyesi, yalnızca dt'ye bağlı)
  public update(dt: number): void {
    for (const [buildingId, queue] of this.queues.entries()) {
      if (queue.length === 0) continue;

      const item = queue[0];
      const uDef = UNITS[item.unitId];

      // Üretim henüz başlamadıysa nüfus kontrolü ve rezervasyonu
      if (!item.reservedPop) {
        if (this.resourceManager.canReservePop(item.team, uDef.pop)) {
          this.resourceManager.reservePop(item.team, uDef.pop);
          item.reservedPop = true;
        } else {
          // Nüfus doluysa bekler
          continue;
        }
      }

      // Üretim sayacı ilerler
      item.progressSec += dt;

      // Üretim tamamlandı mı?
      if (item.progressSec >= item.totalSec) {
        queue.shift();

        // Nüfus rezerve durumundan çıkarılır (birim canlı nüfusa geçer)
        this.resourceManager.releasePop(item.team, uDef.pop);

        // Birim binanın çevresindeki ilk yürünebilir karede doğar
        const spawnPos = this.findSpawnTileAroundBuilding(buildingId);
        const unit = this.unitManager.spawnUnit(item.unitId, item.team, spawnPos);

        // 'unitProduced' olayı yayınlanır
        if (this.eventManager) {
          this.eventManager.emit('unitProduced', { unit, buildingId });
        }

        // İstatistik: askerler için 'soldiersProduced' sayacı +1 (işçiler sayılmaz)
        if (!uDef.tags.includes('worker')) {
          this.soldiersProduced[item.team]++;
        }
      }
    }
  }

  // SPEC S5: stopProduction(building)
  // kuyruk temizlenir; başlamamış birimlerin bedeli iade edilir; üretimi süren birim tamamlanır [EK]
  public stopProduction(building: Building): void {
    const queue = this.queues.get(building.id);
    if (!queue || queue.length === 0) return;

    const first = queue[0];

    if (first.reservedPop) {
      // İlk birimin üretimi başlamış: o birim kuyrukta kalır ve tamamlanır
      const cancelledItems = queue.splice(1);
      for (const item of cancelledItems) {
        const uDef = UNITS[item.unitId];
        this.resourceManager.refund(building.team, uDef.costGold, uDef.costWood);
      }
    } else {
      // İlk birimin üretimi henüz başlamamış (nüfus bekliyor): hepsi iptal edilir ve iade edilir
      const cancelledItems = queue.splice(0);
      for (const item of cancelledItems) {
        const uDef = UNITS[item.unitId];
        this.resourceManager.refund(building.team, uDef.costGold, uDef.costWood);
      }
    }
  }

  // SPEC S6: getQueue(building)
  public getQueue(building: Building): ProductionQueueItem[] {
    return this.queues.get(building.id) || [];
  }

  // SPEC S6: Kalan simülasyon saniyesi okuma fonksiyonu (kuyruğun başındaki birim için)
  public getRemainingSimSec(building: Building): number {
    const queue = this.queues.get(building.id);
    if (!queue || queue.length === 0) return 0;
    const item = queue[0];
    return Math.max(0, item.totalSec - item.progressSec);
  }

  // SPEC S6: getQueuedWorkerCount(team, type)
  // Kuyrukta bekleyen (henüz doğmamış) işçi sayısı
  public getQueuedWorkerCount(team: Team, type: UnitId): number {
    let count = 0;
    for (const queue of this.queues.values()) {
      for (const item of queue) {
        if (item.team === team && item.unitId === type) {
          count++;
        }
      }
    }
    return count;
  }

  // İstatistik okuyucu
  public getSoldiersProduced(team: Team): number {
    return this.soldiersProduced[team];
  }

  private getOrCreateQueue(buildingId: string): ProductionQueueItem[] {
    let q = this.queues.get(buildingId);
    if (!q) {
      q = [];
      this.queues.set(buildingId, q);
    }
    return q;
  }

  private findSpawnTileAroundBuilding(buildingId: string): { x: number; y: number } {
    const building = this.findBuildingById(buildingId);
    if (!building) {
      return { x: 10.5, y: 10.5 };
    }

    const rect = building.getRect();
    const allUnits = this.unitManager.getUnits();

    // SPEC S3: Üretilen birim binanın çevresindeki boş yürünebilir karelerde her biri FARKLI bir noktada doğar
    // Halka halka içten dışa arama (r = 1, 2, 3...)
    for (let r = 1; r <= 3; r++) {
      const candidates: TilePos[] = [];

      // Üst ve alt kenarlar
      for (let x = rect.x - r; x < rect.x + rect.w + r; x++) {
        candidates.push({ x, y: rect.y - r });
        candidates.push({ x, y: rect.y + rect.h + r - 1 });
      }

      // Sol ve sağ kenarlar
      for (let y = rect.y - r + 1; y < rect.y + rect.h + r - 1; y++) {
        candidates.push({ x: rect.x - r, y });
        candidates.push({ x: rect.x + rect.w + r - 1, y });
      }

      // Bu halkadaki boş ve yürünebilir adayları kontrol et
      for (const c of candidates) {
        if (!this.pathfinding.isWalkable(c.x, c.y)) continue;

        // Kare üzerinde başka canlı birim var mı? (< 0.7 mesafe)
        const occupied = allUnits.some(
          (u) =>
            u.state !== 'dead' &&
            Math.hypot(u.pos.x - (c.x + 0.5), u.pos.y - (c.y + 0.5)) < 0.7
        );

        if (!occupied) {
          return { x: c.x + 0.5, y: c.y + 0.5 };
        }
      }
    }

    // Yakındaki tüm kareler doluysa en yakın yürünebilir kareyi al
    const center = building.getCenter();
    const nearest = this.pathfinding.findNearestWalkableTile({
      x: Math.floor(center.x),
      y: Math.floor(center.y),
    });

    if (nearest) {
      return { x: nearest.x + 0.5, y: nearest.y + 0.5 };
    }

    return { x: center.x, y: center.y };
  }

  private findBuildingById(buildingId: string): Building | null {
    if (this.buildingManager) {
      const all = this.buildingManager.getBuildings();
      for (const b of all) {
        if (b.id === buildingId) return b;
      }
    }
    return this.buildingLookup ? this.buildingLookup(buildingId) || null : null;
  }

  public setBuildingLookup(lookup: (id: string) => Building | undefined): void {
    this.buildingLookup = lookup;
  }
}
