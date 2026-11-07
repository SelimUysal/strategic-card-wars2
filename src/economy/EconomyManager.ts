import { Team } from '../types';
import { UnitManager } from '../units/UnitManager';
import { ResourceNodes } from '../world/ResourceNodes';
import { ResourceManager } from './ResourceManager';
import { WorkerManager } from './WorkerManager';

export interface EconomyView {
  gold: number;
  wood: number;
  popUsed: number;
  popCap: number;
  goldWorkers: number;
  woodWorkers: number;
  soldiers: number;
}

export class EconomyManager {
  constructor(
    private resourceManager: ResourceManager,
    private workerManager: WorkerManager,
    private resourceNodes: ResourceNodes,
    private unitManager: UnitManager
  ) {}

  // SPEC S3: update(dt) sırası net olsun:
  // 1. ResourceNodes.update(dt) (tükenen kaynakların yenilenme sayaçları)
  // 2. WorkerManager.update(dt) (işçi hareketleri, toplama ve stoğa aktarma)
  public update(dt: number): void {
    this.resourceNodes.update(dt);
    this.workerManager.update(dt);
  }

  // SPEC S3: getEconomyView(team)
  // { gold, wood, popUsed, popCap, goldWorkers, woodWorkers, soldiers } (soldiers = canlı işçi olmayan birim sayısı)
  public getEconomyView(team: Team): EconomyView {
    return {
      gold: this.resourceManager.getGold(team),
      wood: this.resourceManager.getWood(team),
      popUsed: this.resourceManager.popUsed(team),
      popCap: this.resourceManager.popCap(team),
      goldWorkers: this.workerManager.getWorkerCount(team, 'altin_madencisi'),
      woodWorkers: this.workerManager.getWorkerCount(team, 'oduncu'),
      soldiers: this.unitManager.getSoldiers(team).length,
    };
  }

  // SPEC S3 İstatistik: goldGathered ve woodGathered değerleri okunabilir
  public getGoldGathered(team: Team): number {
    return this.resourceManager.getGoldGathered(team);
  }

  public getWoodGathered(team: Team): number {
    return this.resourceManager.getWoodGathered(team);
  }

  public getResourceManager(): ResourceManager {
    return this.resourceManager;
  }

  public getWorkerManager(): WorkerManager {
    return this.workerManager;
  }
}
