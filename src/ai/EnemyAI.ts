import { BuildingManager } from '../buildings/BuildingManager';
import { ConstructionManager } from '../buildings/ConstructionManager';
import { ProductionManager } from '../buildings/ProductionManager';
import { BattleAI } from '../combat/BattleAI';
import { EventManager } from '../core/EventManager';
import { TimeManager } from '../core/TimeManager';
import { ResourceManager } from '../economy/ResourceManager';
import { WorkerManager } from '../economy/WorkerManager';
import { CardId, DifficultyDef, Team } from '../types';
import { UnitManager } from '../units/UnitManager';
import { ModifierRegistry } from '../units/UnitStats';
import { GameMap } from '../world/MapConfig';
import { EconomyAI } from './EconomyAI';
import { MilitaryAI } from './MilitaryAI';
import { StrategyAI } from './StrategyAI';

export interface EnemyAIDependencies {
  buildingManager: BuildingManager;
  constructionManager: ConstructionManager;
  productionManager: ProductionManager;
  resourceManager: ResourceManager;
  workerManager: WorkerManager;
  unitManager: UnitManager;
  battleAI: BattleAI;
  timeManager: TimeManager;
  map: GameMap;
  modifierRegistry?: ModifierRegistry;
  eventManager?: EventManager;
}

export class EnemyAI {
  private team: Team = 'enemy';
  private difficulty: DifficultyDef;
  private enemyCardIds: CardId[];
  private decisionTimer: number = 0;
  private modifierRegistry?: ModifierRegistry;

  private economyAI: EconomyAI;
  private strategyAI: StrategyAI;
  private militaryAI: MilitaryAI;

  // SPEC S2: EnemyAI sınıfı takım parametresi alır (varsayılan 'enemy'), bir DifficultyDef ve kart listesi ile kurulur
  constructor(
    difficulty: DifficultyDef,
    enemyCardIds: CardId[],
    deps: EnemyAIDependencies,
    team: Team = 'enemy'
  ) {
    this.difficulty = difficulty;
    this.enemyCardIds = [...enemyCardIds];
    this.team = team;
    this.modifierRegistry = deps.modifierRegistry;

    // SPEC S1: toplama çarpanı (EnemyAI başlatılırken ModifierRegistry'ye gatherRate yüzdesi = enemyGatherMult - 1 olarak, source 'difficulty', takım 'enemy' eklenir)
    if (this.modifierRegistry) {
      this.modifierRegistry.removeBySource('difficulty');
      const gatherPct = this.difficulty.enemyGatherMult - 1;
      this.modifierRegistry.addModifier({
        source: 'difficulty',
        team: this.team,
        stat: 'gatherRate',
        pct: gatherPct,
        filter: {},
      });
    }

    // 1. Alt sistem: EconomyAI
    this.economyAI = new EconomyAI(
      this.team,
      deps.buildingManager,
      deps.productionManager,
      deps.resourceManager,
      deps.workerManager
    );

    // 2. Alt sistem: StrategyAI
    this.strategyAI = new StrategyAI(
      this.team,
      this.difficulty,
      this.enemyCardIds,
      deps.buildingManager,
      deps.constructionManager,
      deps.productionManager,
      deps.resourceManager,
      deps.map
    );

    // 3. Alt sistem: MilitaryAI
    this.militaryAI = new MilitaryAI(
      this.team,
      this.difficulty,
      deps.unitManager,
      deps.battleAI,
      deps.timeManager,
      deps.eventManager
    );
  }

  // SPEC S2: update(dt): her decisionIntervalSec (simülasyon saniyesi) bir karar turu çalıştırır.
  // Yapay zekâ sisten etkilenmez; her zaman her şeyi bilir.
  public update(simDt: number): void {
    // Dalga zamanlayıcısı simülasyon zamanıyla çalışır
    this.militaryAI.update(simDt);

    this.decisionTimer += simDt;
    if (this.decisionTimer >= this.difficulty.decisionIntervalSec) {
      this.decisionTimer -= this.difficulty.decisionIntervalSec;
      this.executeDecisionRound();
    }
  }

  // SPEC S2: Bir turda sırayla: (1) EconomyAI, (2) StrategyAI (bina, savunma, asker), (3) MilitaryAI.
  // Her alt adım bir turda en fazla BİR eylem yapar.
  private executeDecisionRound(): void {
    // (1) EconomyAI
    this.economyAI.execute();

    // (2) StrategyAI
    this.strategyAI.execute();

    // (3) MilitaryAI
    this.militaryAI.execute();
  }

  public getEconomyAI(): EconomyAI {
    return this.economyAI;
  }

  public getStrategyAI(): StrategyAI {
    return this.strategyAI;
  }

  public getMilitaryAI(): MilitaryAI {
    return this.militaryAI;
  }

  public getDifficulty(): DifficultyDef {
    return this.difficulty;
  }

  public getEnemyCardIds(): CardId[] {
    return [...this.enemyCardIds];
  }

  public getTeam(): Team {
    return this.team;
  }

  public dispose(): void {
    if (this.modifierRegistry) {
      this.modifierRegistry.removeBySource('difficulty');
    }
    this.militaryAI.dispose();
  }
}
