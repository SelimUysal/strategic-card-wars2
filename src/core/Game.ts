import { EnemyAI, EnemyAIDependencies } from '../ai/EnemyAI';
import { BuildingManager } from '../buildings/BuildingManager';
import { ConstructionManager } from '../buildings/ConstructionManager';
import { ProductionManager } from '../buildings/ProductionManager';
import { CardManager } from '../cards/CardManager';
import { CollectionManager } from '../cards/CollectionManager';
import { DeckManager } from '../cards/DeckManager';
import { BattleAI } from '../combat/BattleAI';
import { CombatManager } from '../combat/CombatManager';
import { CommanderAbilities } from '../commanders/CommanderAbilities';
import { CommanderManager } from '../commanders/CommanderManager';
import { BUILDINGS } from '../data/buildings';
import { DIFFICULTIES } from '../data/difficulties';
import { DEFAULT_PLAYER_FACTION, FACTIONS } from '../data/factions';
import { MAPS } from '../data/maps';
import { UNITS } from '../data/units';
import { EconomyManager } from '../economy/EconomyManager';
import { ResourceManager } from '../economy/ResourceManager';
import { WorkerManager } from '../economy/WorkerManager';
import { DifficultyManager } from '../game-modes/DifficultyManager';
import { SurvivalMode } from '../game-modes/SurvivalMode';
import { MatchEndedEvent, VictoryConditions } from '../game-modes/VictoryConditions';
import { AccountManager } from '../progression/AccountManager';
import { CurrencyManager } from '../progression/CurrencyManager';
import { RewardManager } from '../progression/RewardManager';
import { SaveManager } from '../progression/SaveManager';
import { MatchConfig } from '../types';
import { CardPanel } from '../ui/CardPanel';
import { HUD } from '../ui/HUD';
import { Minimap } from '../ui/Minimap';
import { ResourcePanel } from '../ui/ResourcePanel';
import { UnitManager } from '../units/UnitManager';
import { ModifierRegistry } from '../units/UnitStats';
import { FogOfWar } from '../world/FogOfWar';
import { GameMap } from '../world/MapConfig';
import { MapGenerator } from '../world/MapGenerator';
import { Pathfinding } from '../world/Pathfinding';
import { ResourceNodes } from '../world/ResourceNodes';
import { Terrain } from '../world/Terrain';
import { CameraController } from './CameraController';
import { EventManager } from './EventManager';
import { GameLoop, UpdatableSystem } from './GameLoop';
import { MatchPhaseManager } from './MatchPhaseManager';
import { SceneManager } from './SceneManager';
import { TimeManager } from './TimeManager';

export class Game {
  // Çekirdek motor sistemleri
  private eventManager: EventManager;
  private timeManager: TimeManager;
  private matchPhaseManager: MatchPhaseManager;
  private sceneManager: SceneManager;
  private cameraController: CameraController;
  private gameLoop: GameLoop;

  // Kalıcı ilerleme ve veri yöneticileri
  private saveManager: SaveManager;
  private currencyManager: CurrencyManager;
  private collectionManager: CollectionManager;
  private deckManager: DeckManager;
  private accountManager: AccountManager;
  private cardManager: CardManager;
  private modifierRegistry: ModifierRegistry;
  private commanderManager: CommanderManager;
  private difficultyManager: DifficultyManager;

  // Maç içi aktif varlıklar ve sistemler
  private map: GameMap | null = null;
  private pathfinding: Pathfinding | null = null;
  private terrain: Terrain | null = null;
  private resourceNodes: ResourceNodes | null = null;
  private fogOfWar: FogOfWar | null = null;
  private unitManager: UnitManager | null = null;
  private buildingManager: BuildingManager | null = null;
  private resourceManager: ResourceManager;
  private workerManager: WorkerManager | null = null;
  private economyManager: EconomyManager | null = null;
  private constructionManager: ConstructionManager | null = null;
  private productionManager: ProductionManager | null = null;
  private commanderAbilities: CommanderAbilities | null = null;
  private combatManager: CombatManager | null = null;
  private battleAI: BattleAI | null = null;
  private enemyAI: EnemyAI | null = null;
  private autoPlayerAI: EnemyAI | null = null;
  private victoryConditions: VictoryConditions | null = null;
  private survivalMode: SurvivalMode | null = null;
  private rewardManager: RewardManager | null = null;

  // Arayüz bileşenleri (SPEC S6)
  private uiLayer: HTMLElement | null = null;
  private resourcePanel: ResourcePanel | null = null;
  private hud: HUD | null = null;
  private cardPanel: CardPanel | null = null;
  private minimap: Minimap | null = null;

  // Aktif simülasyon sistemleri listesi (endMatch'te temizlenir)
  private activeSystems: UpdatableSystem[] = [];
  private onMatchEndedBound: ((data: MatchEndedEvent) => void) | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.eventManager = new EventManager();
    this.timeManager = new TimeManager(this.eventManager);
    this.matchPhaseManager = new MatchPhaseManager(
      this.timeManager,
      this.eventManager
    );
    this.sceneManager = new SceneManager(canvas);
    this.cameraController = new CameraController(canvas);
    this.gameLoop = new GameLoop(this.timeManager, this.matchPhaseManager);

    // Kalıcı kayıt, hesap ve deste yöneticileri
    this.saveManager = new SaveManager();
    this.currencyManager = new CurrencyManager();
    this.collectionManager = new CollectionManager();
    this.deckManager = new DeckManager(this.collectionManager);
    this.accountManager = new AccountManager(
      this.saveManager,
      this.currencyManager,
      this.collectionManager,
      this.deckManager
    );

    this.cardManager = new CardManager(this.collectionManager, this.deckManager);
    this.modifierRegistry = new ModifierRegistry();
    this.commanderManager = new CommanderManager(
      this.collectionManager,
      this.modifierRegistry,
      undefined,
      this.timeManager
    );
    this.difficultyManager = new DifficultyManager();
    this.resourceManager = new ResourceManager(this.eventManager);

    // Pencere yeniden boyutlanmasında kamerayı güncelle
    this.sceneManager.onResize((width: number, height: number) => {
      this.cameraController.resize(width, height);
    });

    // Her karede kamera kontrollerini güncelle ve sahneyi çiz
    this.gameLoop.addFrameListener((realDt: number) => {
      this.cameraController.update(realDt);
    });

    this.gameLoop.setRenderCallback(() => {
      this.sceneManager.render(this.cameraController.getCamera());
    });
  }

  // SPEC S1: Game.startMatch(config: MatchConfig)
  public startMatch(config: MatchConfig, autoPlayer: boolean = false): void {
    // 1. Önceki maçı temizle
    this.endMatch();

    // 2. MapGenerator.generate(MAPS[mapId], seed) ve validateMap
    const mapDef = MAPS[config.mapId];
    if (!mapDef) {
      throw new Error(`Geçersiz harita ID: ${config.mapId}`);
    }
    this.map = MapGenerator.generate(mapDef, config.seed);
    MapGenerator.validateMap(this.map, mapDef);

    // 3. Terrain ve ResourceNodes çiz
    this.terrain = new Terrain(this.map);
    this.sceneManager.getScene().add(this.terrain.getGroup());

    this.resourceNodes = new ResourceNodes(this.map);
    this.sceneManager.getScene().add(this.resourceNodes.getGroup());

    // 4. Kamera sınırını ayarla ve kamerayı oyuncu ana karargâhına odakla
    this.cameraController.setBounds(this.map.width, this.map.height);
    const playerHqCenter = this.map.getHqCenter('player');
    this.cameraController.focusOn(playerHqCenter.x, playerHqCenter.y);

    // 5. Pathfinding'i haritayla kur
    this.pathfinding = new Pathfinding(this.map);

    // Sis sistemi kurulumu
    this.fogOfWar = new FogOfWar(this.map, this.timeManager, this.eventManager);
    this.sceneManager.getScene().add(this.fogOfWar.getGroup());

    // 6. BuildingManager.spawnHq('player') ve spawnHq('enemy')
    this.buildingManager = new BuildingManager(
      this.map,
      this.pathfinding,
      this.eventManager,
      this.modifierRegistry,
      this.fogOfWar
    );
    this.sceneManager.getScene().add(this.buildingManager.getGroup());

    this.buildingManager.spawnHq('player');
    this.buildingManager.spawnHq('enemy');

    // 7. ResourceManager.init: oyuncu MATCH_RULES.playerStartGold / playerStartWood / popCap; DifficultyManager.applyToMatch ile düşman
    const { difficulty } = this.difficultyManager.applyToMatch(config, {
      resourceManager: this.resourceManager,
      cardManager: this.cardManager,
    });

    // 8. Her iki takım için başlangıç işçileri (WorkerManager)
    this.unitManager = new UnitManager(
      this.eventManager,
      this.modifierRegistry,
      this.fogOfWar
    );
    this.sceneManager.getScene().add(this.unitManager.getGroup());

    this.workerManager = new WorkerManager(
      this.map,
      this.pathfinding,
      this.resourceNodes,
      this.resourceManager,
      this.unitManager,
      this.modifierRegistry,
      this.eventManager
    );
    this.workerManager.initStartWorkers();

    // 9. Takım renkleri FACTIONS'tan (UnitManager.setTeamColors, bina renkleri)
    const playerFaction = FACTIONS[config.playerFactionId] || FACTIONS[DEFAULT_PLAYER_FACTION];
    const enemyFaction = FACTIONS[config.enemyFactionId] || FACTIONS['fransa'];
    const playerHex = playerFaction.colorHex;
    const enemyHex = enemyFaction.colorHex;

    this.unitManager.setTeamColors(playerHex, enemyHex);
    this.buildingManager.setTeamColors(playerHex, enemyHex);

    // 10. Komutanlar: CommanderManager ile seç ve uygula (Cehennem'de ikisi de null)
    this.commanderAbilities = new CommanderAbilities(this.unitManager);
    this.commanderManager.setDependencies({
      collectionManager: this.collectionManager,
      modifierRegistry: this.modifierRegistry,
      fogOfWar: this.fogOfWar,
      timeManager: this.timeManager,
      commanderAbilities: this.commanderAbilities,
    });
    this.commanderManager.setupForMatch(
      config.difficultyId,
      config.seed,
      config.playerCommanderId
    );
    this.commanderManager.applyAtMatchStart();

    // İnşaat, üretim ve savaş alt sistemleri
    this.constructionManager = new ConstructionManager(
      this.map,
      this.buildingManager,
      this.resourceManager,
      this.modifierRegistry,
      this.eventManager
    );

    this.productionManager = new ProductionManager(
      this.unitManager,
      this.resourceManager,
      this.pathfinding,
      this.buildingManager,
      this.workerManager,
      this.eventManager
    );

    this.combatManager = new CombatManager(
      this.matchPhaseManager,
      this.unitManager,
      this.buildingManager,
      this.pathfinding,
      this.modifierRegistry,
      this.eventManager
    );

    this.battleAI = new BattleAI(
      this.matchPhaseManager,
      this.unitManager,
      this.map,
      this.pathfinding,
      this.combatManager,
      this.eventManager
    );

    this.economyManager = new EconomyManager(
      this.resourceManager,
      this.workerManager,
      this.resourceNodes,
      this.unitManager
    );

    // 11. EnemyAI'yı kur
    const enemyAiDeps: EnemyAIDependencies = {
      buildingManager: this.buildingManager,
      constructionManager: this.constructionManager,
      productionManager: this.productionManager,
      resourceManager: this.resourceManager,
      workerManager: this.workerManager,
      unitManager: this.unitManager,
      battleAI: this.battleAI,
      timeManager: this.timeManager,
      map: this.map,
      modifierRegistry: this.modifierRegistry,
      eventManager: this.eventManager,
    };

    this.enemyAI = new EnemyAI(
      difficulty,
      difficulty.enemyCardIds,
      enemyAiDeps,
      'enemy'
    );

    // SPEC S4: &autoplayer=1 varsa OYUNCU tarafını da bir EnemyAI yönetir
    if (autoPlayer) {
      const playerDeck = this.deckManager.getDeck();
      this.autoPlayerAI = new EnemyAI(
        DIFFICULTIES.normal,
        playerDeck,
        enemyAiDeps,
        'player'
      );
    } else {
      this.autoPlayerAI = null;
    }

    // 12. Sağlayıcı fonksiyonları bağla
    // a) CardManager.isCardAvailable -> ConstructionManager ve ProductionManager
    this.constructionManager.setCardAvailabilityProvider((team, cardId) =>
      this.cardManager.isCardAvailable(team, cardId)
    );
    this.productionManager.setCardAvailabilityProvider((team, cardId) =>
      this.cardManager.isCardAvailable(team, cardId)
    );

    // b) WorkerManager kuyruk sayısı sağlayıcısı
    this.workerManager.setQueuedWorkerCountProvider((team, type) =>
      this.productionManager!.getQueuedWorkerCount(team, type)
    );

    // c) FogOfWar görüş sağlayıcısı: oyuncu birimleri ve binaları
    this.fogOfWar.setVisionProvider(() => {
      const sources: Array<{ x: number; y: number; vision: number }> = [];
      if (!this.unitManager || !this.buildingManager) return sources;

      // Canlı oyuncu birimleri
      const pUnits = this.unitManager.getUnits('player');
      for (const u of pUnits) {
        if (u.state !== 'dead') {
          const uDef = UNITS[u.defId];
          sources.push({
            x: u.pos.x,
            y: u.pos.y,
            vision: uDef ? uDef.vision : 8,
          });
        }
      }

      // Aktif/inşaattaki oyuncu binaları
      const pBuildings = this.buildingManager.getBuildings('player');
      for (const b of pBuildings) {
        if (b.state !== 'destroyed') {
          const center = b.getCenter();
          const bDef = BUILDINGS[b.defId];
          sources.push({
            x: center.x,
            y: center.y,
            vision: bDef ? bDef.vision : 10,
          });
        }
      }

      return sources;
    });

    // 13. Cehennem'de düşman karargâhına Building.minHp = 1
    if (config.difficultyId === 'cehennem') {
      const enemyHq = this.buildingManager.getHq('enemy');
      if (enemyHq) {
        enemyHq.minHp = 1;
      }
    }

    // 14. VictoryConditions, SurvivalMode, RewardManager'ı başlat
    this.victoryConditions = new VictoryConditions(
      this.buildingManager,
      this.timeManager,
      this.eventManager
    );
    this.victoryConditions.setupMatch(config.difficultyId);

    const isCehennem = config.difficultyId === 'cehennem';
    this.survivalMode = new SurvivalMode(
      this.timeManager,
      this.accountManager,
      this.eventManager
    );
    this.survivalMode.init(config.mapId, isCehennem);

    this.rewardManager = new RewardManager(
      config,
      difficulty,
      this.accountManager,
      this.currencyManager,
      this.resourceManager,
      this.timeManager,
      this.eventManager
    );

    // Maç bitiş olayını dinle
    this.onMatchEndedBound = async ({
      result,
      survivalTimeSec,
    }: MatchEndedEvent) => {
      if (this.survivalMode?.isActive()) {
        await this.survivalMode.handleMatchEnd(survivalTimeSec);
      }
      if (this.rewardManager) {
        await this.rewardManager.finalizeMatch(result, survivalTimeSec);
      }
      this.endMatchClock();
    };
    this.eventManager.on('matchEnded', this.onMatchEndedBound);

    // 15. Sistemleri registerSystem ile şu update sırasıyla kaydet:
    // EconomyManager, ConstructionManager, ProductionManager, EnemyAI, BattleAI, UnitManager, CombatManager, CommanderAbilities, FogOfWar, VictoryConditions [EK]
    this.registerGameSystem(this.economyManager);
    this.registerGameSystem(this.constructionManager);
    this.registerGameSystem(this.productionManager);
    this.registerGameSystem(this.enemyAI);
    if (this.autoPlayerAI) {
      this.registerGameSystem(this.autoPlayerAI);
    }
    this.registerGameSystem(this.battleAI);
    this.registerGameSystem(this.unitManager);
    this.registerGameSystem(this.combatManager);
    this.registerGameSystem(this.commanderAbilities);
    this.registerGameSystem(this.fogOfWar);
    this.registerGameSystem(this.victoryConditions);

    // 16. MatchPhaseManager.'prep' ve startMatchClock()
    this.matchPhaseManager.startMatch();
    this.startMatchClock();

    // 17. SPEC S6: Maç içi arayüz bileşenlerini oluştur
    const appContainer = this.canvas.parentElement || document.body;
    this.uiLayer = document.createElement('div');
    this.uiLayer.className = 'ui-layer';
    appContainer.appendChild(this.uiLayer);

    this.resourcePanel = new ResourcePanel(this.uiLayer, this.economyManager);
    this.hud = new HUD(
      this.uiLayer,
      this.buildingManager,
      this.timeManager,
      this.commanderManager,
      this.rewardManager,
      config.difficultyId,
      enemyFaction
    );
    this.cardPanel = new CardPanel(
      this.uiLayer,
      this.deckManager,
      this.cardManager,
      this.constructionManager,
      this.productionManager,
      this.buildingManager,
      this.resourceManager,
      this.workerManager,
      this.cameraController,
      this.sceneManager,
      this.canvas
    );
    this.minimap = new Minimap(
      this.uiLayer,
      this.map,
      this.fogOfWar,
      this.unitManager,
      this.buildingManager,
      this.cameraController,
      playerHex,
      enemyHex
    );
  }

  // SPEC S3: Game.endMatch()
  // Maç saatini durdur, bütün varlıkları, bonusları, olay abonelikleri ve çizimleri temizle (dispose); sonraki startMatch temiz başlamalı.
  public endMatch(): void {
    this.endMatchClock();
    this.timeManager.reset();
    this.matchPhaseManager.reset();

    // SPEC S6: Arayüz bileşenlerini temizle
    if (this.resourcePanel) {
      this.resourcePanel.destroy();
      this.resourcePanel = null;
    }
    if (this.hud) {
      this.hud.destroy();
      this.hud = null;
    }
    if (this.cardPanel) {
      this.cardPanel.destroy();
      this.cardPanel = null;
    }
    if (this.minimap) {
      this.minimap.destroy();
      this.minimap = null;
    }
    if (this.uiLayer) {
      if (this.uiLayer.parentElement) {
        this.uiLayer.parentElement.removeChild(this.uiLayer);
      }
      this.uiLayer = null;
    }

    if (this.onMatchEndedBound) {
      this.eventManager.off('matchEnded', this.onMatchEndedBound);
      this.onMatchEndedBound = null;
    }

    // Kayıtlı sistemleri temizle
    for (const sys of this.activeSystems) {
      this.gameLoop.unregisterSystem(sys);
    }
    this.activeSystems = [];

    // Çizim nesnelerini ve alt sistemleri temizle
    if (this.terrain) {
      this.sceneManager.getScene().remove(this.terrain.getGroup());
      this.terrain.dispose();
      this.terrain = null;
    }
    if (this.resourceNodes) {
      this.sceneManager.getScene().remove(this.resourceNodes.getGroup());
      this.resourceNodes.dispose();
      this.resourceNodes = null;
    }
    if (this.fogOfWar) {
      this.sceneManager.getScene().remove(this.fogOfWar.getGroup());
      this.fogOfWar.dispose();
      this.fogOfWar = null;
    }
    if (this.unitManager) {
      this.sceneManager.getScene().remove(this.unitManager.getGroup());
      this.unitManager.dispose();
      this.unitManager = null;
    }
    if (this.buildingManager) {
      this.sceneManager.getScene().remove(this.buildingManager.getGroup());
      this.buildingManager.dispose();
      this.buildingManager = null;
    }

    // Mantıksal sistemler ve bonus temizliği
    this.modifierRegistry.clear();
    this.commanderManager.removeAll();

    if (this.enemyAI) {
      this.enemyAI.dispose();
      this.enemyAI = null;
    }
    if (this.autoPlayerAI) {
      this.autoPlayerAI.dispose();
      this.autoPlayerAI = null;
    }
    if (this.victoryConditions) {
      this.victoryConditions.dispose();
      this.victoryConditions = null;
    }
    if (this.rewardManager) {
      this.rewardManager.dispose();
      this.rewardManager = null;
    }

    this.survivalMode = null;
    this.combatManager = null;
    this.battleAI = null;
    this.workerManager = null;
    this.productionManager = null;
    this.constructionManager = null;
    this.economyManager = null;
    this.commanderAbilities = null;
    this.pathfinding = null;
    this.map = null;
  }

  private registerGameSystem(system: UpdatableSystem): void {
    this.activeSystems.push(system);
    this.gameLoop.registerSystem(system);
  }

  public registerSystem(system: UpdatableSystem): void {
    this.registerGameSystem(system);
  }

  public startMatchClock(): void {
    this.timeManager.setMatchRunning(true);
    this.matchPhaseManager.startMatch();
  }

  public endMatchClock(): void {
    this.timeManager.setMatchRunning(false);
  }

  public start(): void {
    this.gameLoop.start();
  }

  public stop(): void {
    this.gameLoop.stop();
  }

  // Getters
  public getEventManager(): EventManager {
    return this.eventManager;
  }

  public getTimeManager(): TimeManager {
    return this.timeManager;
  }

  public getMatchPhaseManager(): MatchPhaseManager {
    return this.matchPhaseManager;
  }

  public getSceneManager(): SceneManager {
    return this.sceneManager;
  }

  public getCameraController(): CameraController {
    return this.cameraController;
  }

  public getGameLoop(): GameLoop {
    return this.gameLoop;
  }

  public getAccountManager(): AccountManager {
    return this.accountManager;
  }

  public getCollectionManager(): CollectionManager {
    return this.collectionManager;
  }

  public getDeckManager(): DeckManager {
    return this.deckManager;
  }

  public getCurrencyManager(): CurrencyManager {
    return this.currencyManager;
  }

  public getCardManager(): CardManager {
    return this.cardManager;
  }

  public getCommanderManager(): CommanderManager {
    return this.commanderManager;
  }

  public getDifficultyManager(): DifficultyManager {
    return this.difficultyManager;
  }

  public getResourceManager(): ResourceManager {
    return this.resourceManager;
  }

  public getBuildingManager(): BuildingManager | null {
    return this.buildingManager;
  }

  public getUnitManager(): UnitManager | null {
    return this.unitManager;
  }

  public getVictoryConditions(): VictoryConditions | null {
    return this.victoryConditions;
  }

  public getSurvivalMode(): SurvivalMode | null {
    return this.survivalMode;
  }

  public getRewardManager(): RewardManager | null {
    return this.rewardManager;
  }

  public getResourcePanel(): ResourcePanel | null {
    return this.resourcePanel;
  }

  public getHud(): HUD | null {
    return this.hud;
  }

  public getCardPanel(): CardPanel | null {
    return this.cardPanel;
  }

  public getMinimap(): Minimap | null {
    return this.minimap;
  }

  public destroy(): void {
    this.endMatch();
    this.gameLoop.stop();
    this.cameraController.destroy();
    this.sceneManager.destroy();
    this.timeManager.destroy();
    this.eventManager.clear();
  }
}
