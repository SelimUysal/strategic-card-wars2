import { BuildingManager } from '../buildings/BuildingManager';
import { ProductionManager } from '../buildings/ProductionManager';
import { MATCH_RULES } from '../data/matchRules';
import { UNITS } from '../data/units';
import { ResourceManager } from '../economy/ResourceManager';
import { WorkerManager } from '../economy/WorkerManager';
import { Team, UnitId } from '../types';

export class EconomyAI {
  constructor(
    private team: Team,
    private buildingManager: BuildingManager,
    private productionManager: ProductionManager,
    private resourceManager: ResourceManager,
    private workerManager: WorkerManager
  ) {}

  // SPEC S3: EconomyAI
  // altın madencisi sayısı (kuyruktakiler dahil) < MATCH_RULES.maxWorkers.altin_madencisi veya oduncu sayısı < maxWorkers.oduncu ise,
  // sayısı az olandan (eşitse altın madencisinden) başlayarak ana karargâh kuyruğuna 1 işçi ekler (bedel yeterliyse ve canAddWorker true ise).
  // Bir turda en fazla BİR eylem yapar.
  public execute(): boolean {
    const goldCount =
      this.workerManager.getWorkerCount(this.team, 'altin_madencisi') +
      this.productionManager.getQueuedWorkerCount(this.team, 'altin_madencisi');
    const woodCount =
      this.workerManager.getWorkerCount(this.team, 'oduncu') +
      this.productionManager.getQueuedWorkerCount(this.team, 'oduncu');

    const maxGold = MATCH_RULES.maxWorkers.altin_madencisi;
    const maxWood = MATCH_RULES.maxWorkers.oduncu;

    const canAddGold =
      goldCount < maxGold && this.workerManager.canAddWorker(this.team, 'altin_madencisi');
    const canAddWood =
      woodCount < maxWood && this.workerManager.canAddWorker(this.team, 'oduncu');

    if (!canAddGold && !canAddWood) {
      return false;
    }

    // Sayısı az olandan (eşitse altın madencisinden) başlayarak
    let order: UnitId[];
    if (goldCount <= woodCount) {
      order = ['altin_madencisi', 'oduncu'];
    } else {
      order = ['oduncu', 'altin_madencisi'];
    }

    const hq = this.buildingManager.getHq(this.team);
    if (!hq || hq.state !== 'active') {
      return false;
    }

    for (const workerType of order) {
      const isGold = workerType === 'altin_madencisi';
      if (isGold && !canAddGold) continue;
      if (!isGold && !canAddWood) continue;

      const uDef = UNITS[workerType];
      if (this.resourceManager.canAfford(this.team, uDef.costGold, uDef.costWood)) {
        const enqueued = this.productionManager.enqueue(this.team, hq, workerType);
        if (enqueued) {
          return true; // En fazla 1 eylem tamamlandı
        }
      }
    }

    return false;
  }
}
