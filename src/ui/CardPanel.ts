import * as THREE from 'three';
import { BuildingManager } from '../buildings/BuildingManager';
import { ConstructionManager } from '../buildings/ConstructionManager';
import { ProductionManager, ProductionQueueItem } from '../buildings/ProductionManager';
import { CardManager } from '../cards/CardManager';
import { DeckManager } from '../cards/DeckManager';
import { CameraController } from '../core/CameraController';
import { SceneManager } from '../core/SceneManager';
import { BUILDINGS } from '../data/buildings';
import { CARDS } from '../data/cards';
import { UNITS } from '../data/units';
import { ResourceManager } from '../economy/ResourceManager';
import { WorkerManager } from '../economy/WorkerManager';
import { BuildingId, CardDef, CardId, TilePos, UnitId } from '../types';

interface DragState {
  cardId: CardId;
  buildingId: BuildingId;
  footprint: { w: number; h: number };
  pointerId: number;
  startX: number;
  startY: number;
  isDragging: boolean;
  currentTile: TilePos | null;
  isValid: boolean;
}

interface CardItemView {
  cardDef: CardDef;
  el: HTMLElement;
  nameEl: HTMLElement;
  roleEl: HTMLElement;
  statusEl: HTMLElement;
  queueBoxEl: HTMLElement;
  queueCountEl: HTMLElement;
  remainingEl: HTMLElement;
  progressFillEl: HTMLElement;
  stopBtnEl: HTMLButtonElement;
  costLabelEl: HTMLElement;
  costValEl: HTMLElement;
  toastEl: HTMLElement;
  toastTimer: number | null;

  // DOM titremesini önlemek için önbellek (S1, S5)
  lastDisabled: boolean;
  lastStatusText: string;
  lastStatusVisible: boolean;
  lastQueueBoxVisible: boolean;
  lastQueueCountText: string;
  lastRemainingText: string;
  lastProgressPct: number;
  lastStopBtnVisible: boolean;
  lastCostLabel: string;
  lastCostVal: string;
}

interface WorkerButtonView {
  type: 'altin_madencisi' | 'oduncu';
  btn: HTMLButtonElement;
  infoEl: HTMLElement;
  progressBarEl: HTMLElement;
  progressFillEl: HTMLElement;
  toastEl: HTMLElement;
  toastTimer: number | null;

  lastDisabled: boolean;
  lastInfoVisible: boolean;
  lastInfoText: string;
  lastProgressPct: number;
}

export class CardPanel {
  private element: HTMLElement;
  private cardListEl: HTMLElement;
  private workerPanelEl: HTMLElement;

  private updateInterval: number | null = null;
  private dragState: DragState | null = null;
  private pointerDownCandidate: {
    cardId: CardId;
    buildingId: BuildingId;
    footprint: { w: number; h: number };
    startX: number;
    startY: number;
    pointerId: number;
  } | null = null;

  private lastPointerUpHandledTime: number = 0;

  private ghostMesh: THREE.Mesh | null = null;
  private ghostMaterial: THREE.MeshBasicMaterial | null = null;
  private raycaster: THREE.Raycaster = new THREE.Raycaster();

  private cardViews: Map<CardId, CardItemView> = new Map();
  private workerViews: Map<'altin_madencisi' | 'oduncu', WorkerButtonView> = new Map();

  private onPointerMoveBound: (e: PointerEvent) => void;
  private onPointerUpBound: (e: PointerEvent) => void;

  constructor(
    private parent: HTMLElement,
    private deckManager: DeckManager,
    private cardManager: CardManager,
    private constructionManager: ConstructionManager,
    private productionManager: ProductionManager,
    private buildingManager: BuildingManager,
    private resourceManager: ResourceManager,
    private workerManager: WorkerManager,
    private cameraController: CameraController,
    private sceneManager: SceneManager,
    private canvas: HTMLCanvasElement
  ) {
    this.element = document.createElement('div');
    this.element.className = 'card-panel-container';

    this.cardListEl = document.createElement('div');
    this.cardListEl.className = 'card-list';

    this.workerPanelEl = document.createElement('div');
    this.workerPanelEl.className = 'worker-buttons-panel';

    this.element.appendChild(this.cardListEl);
    this.element.appendChild(this.workerPanelEl);
    this.parent.appendChild(this.element);

    this.onPointerMoveBound = this.onPointerMove.bind(this);
    this.onPointerUpBound = this.onPointerUp.bind(this);

    window.addEventListener('pointermove', this.onPointerMoveBound);
    window.addEventListener('pointerup', this.onPointerUpBound);
    window.addEventListener('pointercancel', this.onPointerUpBound);

    // SPEC S1: Kart ve işçi buton elemanları maç başında BİR KEZ oluşturulur
    this.initCardElements();
    this.setupWorkerButtons();
    this.update();

    // Saniyede 10 kez yenilenir (100 ms)
    this.updateInterval = window.setInterval(() => {
      this.update();
    }, 100);
  }

  // SPEC S1: Kart elemanları maç başında BİR KEZ oluşturulur
  private initCardElements(): void {
    const deck = this.deckManager.getDeck().slice(0, 5);
    this.cardListEl.innerHTML = '';
    this.cardViews.clear();

    for (const cardId of deck) {
      const cardDef = CARDS[cardId];
      if (!cardDef) continue;

      const cardEl = document.createElement('div');
      cardEl.className = 'game-card';
      cardEl.setAttribute('data-card-id', cardDef.id);

      cardEl.innerHTML = `
        <div class="game-card-toast" data-field="toast"></div>
        <div>
          <div class="game-card-name" data-field="name">${cardDef.nameTr}</div>
          <div class="game-card-role" data-field="role">${cardDef.roleTr}</div>
          <div class="game-card-status" data-field="status" style="display: none;"></div>
          <div class="game-card-queue-box" data-field="queue-box" style="display: none;">
            <div class="game-card-queue-text">
              <span data-field="queue-count"></span>
              <span class="game-card-remaining" data-field="remaining"></span>
            </div>
            <div class="game-card-progress-bar">
              <div class="game-card-progress-fill" data-field="progress-fill" style="width: 0%;"></div>
            </div>
            <button type="button" class="game-card-stop-btn" data-action="stop-prod" style="display: none;">Durdur</button>
          </div>
        </div>
        <div class="game-card-cost">
          <span data-field="cost-label">Maliyet:</span>
          <span data-field="cost-val">0 / 0</span>
        </div>
      `;

      const nameEl = cardEl.querySelector('[data-field="name"]') as HTMLElement;
      const roleEl = cardEl.querySelector('[data-field="role"]') as HTMLElement;
      const statusEl = cardEl.querySelector('[data-field="status"]') as HTMLElement;
      const queueBoxEl = cardEl.querySelector('[data-field="queue-box"]') as HTMLElement;
      const queueCountEl = cardEl.querySelector('[data-field="queue-count"]') as HTMLElement;
      const remainingEl = cardEl.querySelector('[data-field="remaining"]') as HTMLElement;
      const progressFillEl = cardEl.querySelector('[data-field="progress-fill"]') as HTMLElement;
      const stopBtnEl = cardEl.querySelector('[data-action="stop-prod"]') as HTMLButtonElement;
      const costLabelEl = cardEl.querySelector('[data-field="cost-label"]') as HTMLElement;
      const costValEl = cardEl.querySelector('[data-field="cost-val"]') as HTMLElement;
      const toastEl = cardEl.querySelector('[data-field="toast"]') as HTMLElement;

      // SPEC S2: 'Durdur' düğmesi kendi tıklamasını alır ve kartın tıklamasını tetiklemez
      stopBtnEl.addEventListener('pointerdown', (e: PointerEvent) => {
        e.stopPropagation();
      });
      stopBtnEl.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        this.handleStopClick(cardDef.id);
      });

      // Pointerdown: sürükleme adayı veya tıklama başlangıcı
      cardEl.addEventListener('pointerdown', (e: PointerEvent) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        this.handleCardPointerDown(e, cardDef.id);
      });

      // Click fallback: pointerup ile yakalanamayan durumlar için
      cardEl.addEventListener('click', () => {
        if (performance.now() - this.lastPointerUpHandledTime < 300) {
          return;
        }
        this.handleCardClick(cardDef.id);
      });

      const view: CardItemView = {
        cardDef,
        el: cardEl,
        nameEl,
        roleEl,
        statusEl,
        queueBoxEl,
        queueCountEl,
        remainingEl,
        progressFillEl,
        stopBtnEl,
        costLabelEl,
        costValEl,
        toastEl,
        toastTimer: null,
        lastDisabled: false,
        lastStatusText: '',
        lastStatusVisible: false,
        lastQueueBoxVisible: false,
        lastQueueCountText: '',
        lastRemainingText: '',
        lastProgressPct: -1,
        lastStopBtnVisible: false,
        lastCostLabel: '',
        lastCostVal: '',
      };

      this.cardViews.set(cardDef.id, view);
      this.cardListEl.appendChild(cardEl);
    }
  }

  // SPEC S1 & S6: İşçi butonları maç başında bir kez oluşturulur
  private setupWorkerButtons(): void {
    const goldMinerDef = UNITS.altin_madencisi;
    const woodcutterDef = UNITS.oduncu;

    this.workerPanelEl.innerHTML = `
      <button type="button" class="worker-btn" data-worker="altin_madencisi">
        <span class="worker-btn-name">Altın Madencisi</span>
        <span class="worker-btn-cost">${goldMinerDef.costGold} / ${goldMinerDef.costWood}</span>
        <div class="worker-btn-info" data-field="info" style="display: none;"></div>
        <div class="worker-btn-progress-bar" data-field="pbar" style="display: none;">
          <div class="worker-btn-progress-fill" data-field="pfill" style="width: 0%;"></div>
        </div>
        <div class="game-card-toast" data-field="toast"></div>
      </button>
      <button type="button" class="worker-btn" data-worker="oduncu">
        <span class="worker-btn-name">Oduncu</span>
        <span class="worker-btn-cost">${woodcutterDef.costGold} / ${woodcutterDef.costWood}</span>
        <div class="worker-btn-info" data-field="info" style="display: none;"></div>
        <div class="worker-btn-progress-bar" data-field="pbar" style="display: none;">
          <div class="worker-btn-progress-fill" data-field="pfill" style="width: 0%;"></div>
        </div>
        <div class="game-card-toast" data-field="toast"></div>
      </button>
    `;

    const types: ('altin_madencisi' | 'oduncu')[] = ['altin_madencisi', 'oduncu'];

    for (const type of types) {
      const btn = this.workerPanelEl.querySelector(`[data-worker="${type}"]`) as HTMLButtonElement;
      const infoEl = btn.querySelector('[data-field="info"]') as HTMLElement;
      const progressBarEl = btn.querySelector('[data-field="pbar"]') as HTMLElement;
      const progressFillEl = btn.querySelector('[data-field="pfill"]') as HTMLElement;
      const toastEl = btn.querySelector('[data-field="toast"]') as HTMLElement;

      btn.addEventListener('click', () => {
        this.handleWorkerClick(type);
      });

      this.workerViews.set(type, {
        type,
        btn,
        infoEl,
        progressBarEl,
        progressFillEl,
        toastEl,
        toastTimer: null,
        lastDisabled: false,
        lastInfoVisible: false,
        lastInfoText: '',
        lastProgressPct: -1,
      });
    }
  }

  // SPEC S6: Mevcut oyun hızı çarpanını HUD'dan güvenle okur (1x, 1,5x, 2x)
  private getCurrentTimeScale(): number {
    const speedEl =
      this.parent.querySelector<HTMLElement>('[data-field="speed"]') ||
      document.querySelector<HTMLElement>('[data-field="speed"]');
    if (speedEl) {
      const text = speedEl.textContent?.trim();
      if (text === '1,5x') return 1.5;
      if (text === '2x') return 2;
    }
    return 1;
  }

  // SPEC S4: Kart üzerinde 1 saniyelik uyarı gösterimi ('Kuyruk dolu', 'Kaynak yetersiz')
  public showWarning(cardId: CardId, text: 'Kuyruk dolu' | 'Kaynak yetersiz'): void {
    const view = this.cardViews.get(cardId);
    if (!view) return;

    view.toastEl.textContent = text;
    view.toastEl.classList.add('visible');

    if (view.toastTimer !== null) {
      window.clearTimeout(view.toastTimer);
    }
    view.toastTimer = window.setTimeout(() => {
      view.toastEl.classList.remove('visible');
      view.toastTimer = null;
    }, 1000);
  }

  // SPEC S4: İşçi butonu üzerinde 1 saniyelik uyarı gösterimi
  public showWorkerWarning(type: 'altin_madencisi' | 'oduncu', text: 'Kuyruk dolu' | 'Kaynak yetersiz'): void {
    const view = this.workerViews.get(type);
    if (!view) return;

    view.toastEl.textContent = text;
    view.toastEl.classList.add('visible');

    if (view.toastTimer !== null) {
      window.clearTimeout(view.toastTimer);
    }
    view.toastTimer = window.setTimeout(() => {
      view.toastEl.classList.remove('visible');
      view.toastTimer = null;
    }, 1000);
  }

  // SPEC S3: Asker kartı + bina hazırsa her tıklama TAM OLARAK 1 birimi kuyruğa ekler
  private handleCardClick(cardId: CardId): void {
    const view = this.cardViews.get(cardId);
    if (!view) return;

    const cardDef = view.cardDef;
    const isAvailable = this.cardManager.isCardAvailable('player', cardDef.id);
    if (!isAvailable) return;

    if (cardDef.category === 'asker') {
      const unitDef = UNITS[cardDef.refId as UnitId];
      const prodBuildingId = unitDef.producedAt as BuildingId;
      const playerBuildings = this.buildingManager.getBuildingsOfType('player', prodBuildingId);
      const activeBuilding = playerBuildings.find((b) => b.state === 'active');
      const constructingBuilding = playerBuildings.find((b) => b.state === 'constructing');

      if (activeBuilding) {
        // Bina hazır: Asker üretimi kuyruğuna ekle
        const queue = this.productionManager.getQueue(activeBuilding);
        if (queue.length >= 5) {
          this.showWarning(cardId, 'Kuyruk dolu');
          return;
        }

        const canAfford = this.resourceManager.canAfford('player', unitDef.costGold, unitDef.costWood);
        if (!canAfford) {
          this.showWarning(cardId, 'Kaynak yetersiz');
          return;
        }

        const enqueued = this.productionManager.enqueue('player', activeBuilding, unitDef.id);
        if (!enqueued) {
          if (this.productionManager.getQueue(activeBuilding).length >= 5) {
            this.showWarning(cardId, 'Kuyruk dolu');
          } else {
            this.showWarning(cardId, 'Kaynak yetersiz');
          }
        }
        this.update();
      } else if (!constructingBuilding) {
        // Bina henüz kurulmamış ve tıklanmış: Kaynak yetersizse uyar
        const bDef = BUILDINGS[prodBuildingId];
        const canAfford = this.resourceManager.canAfford('player', bDef.costGold, bDef.costWood);
        if (!canAfford) {
          this.showWarning(cardId, 'Kaynak yetersiz');
        }
      }
    } else {
      // Savunma kartı
      const bDefId = cardDef.refId as BuildingId;
      const bDef = BUILDINGS[bDefId];
      const activeBuildings = this.buildingManager.getBuildingsOfType('player', bDefId);
      if (activeBuildings.length >= bDef.maxCount) {
        this.showWarning(cardId, 'Kuyruk dolu');
      } else if (!this.resourceManager.canAfford('player', bDef.costGold, bDef.costWood)) {
        this.showWarning(cardId, 'Kaynak yetersiz');
      }
    }
  }

  // İşçi butonuna tıklama
  private handleWorkerClick(type: 'altin_madencisi' | 'oduncu'): void {
    const hq = this.buildingManager.getHq('player');
    if (!hq || hq.state !== 'active') return;

    const uDef = UNITS[type];
    const queue = this.productionManager.getQueue(hq);
    const canAdd = this.workerManager.canAddWorker('player', type);

    if (queue.length >= 5 || !canAdd) {
      this.showWorkerWarning(type, 'Kuyruk dolu');
      return;
    }

    if (!this.resourceManager.canAfford('player', uDef.costGold, uDef.costWood)) {
      this.showWorkerWarning(type, 'Kaynak yetersiz');
      return;
    }

    const enqueued = this.productionManager.enqueue('player', hq, type);
    if (!enqueued) {
      if (this.productionManager.getQueue(hq).length >= 5 || !this.workerManager.canAddWorker('player', type)) {
        this.showWorkerWarning(type, 'Kuyruk dolu');
      } else {
        this.showWorkerWarning(type, 'Kaynak yetersiz');
      }
    }
    this.update();
  }

  private handleStopClick(cardId: CardId): void {
    const view = this.cardViews.get(cardId);
    if (!view || view.cardDef.category !== 'asker') return;

    const unitDef = UNITS[view.cardDef.refId as UnitId];
    const prodBuildingId = unitDef.producedAt as BuildingId;
    const activeBuilding = this.buildingManager
      .getBuildingsOfType('player', prodBuildingId)
      .find((b) => b.state === 'active');

    if (activeBuilding) {
      this.productionManager.stopProduction(activeBuilding);
      this.update();
    }
  }

  // SPEC S3: Tıklama ile sürükleme ayrımı (işaretçi 6 pikselden az hareket ettiyse tıklamadır)
  private handleCardPointerDown(e: PointerEvent, cardId: CardId): void {
    const view = this.cardViews.get(cardId);
    if (!view) return;

    const cardDef = view.cardDef;
    const isAvailable = this.cardManager.isCardAvailable('player', cardDef.id);
    if (!isAvailable) return;

    let buildingId: BuildingId | null = null;
    let footprint: { w: number; h: number } | null = null;

    if (cardDef.category === 'asker') {
      const unitDef = UNITS[cardDef.refId as UnitId];
      const prodBuildingId = unitDef.producedAt as BuildingId;
      const playerBuildings = this.buildingManager.getBuildingsOfType('player', prodBuildingId);
      const activeBuilding = playerBuildings.find((b) => b.state === 'active');
      const constructingBuilding = playerBuildings.find((b) => b.state === 'constructing');

      // Yalnızca bina henüz hiç yokken sürüklenebilir
      if (!activeBuilding && !constructingBuilding) {
        const bDef = BUILDINGS[prodBuildingId];
        const canAfford = this.resourceManager.canAfford('player', bDef.costGold, bDef.costWood);
        if (canAfford) {
          buildingId = prodBuildingId;
          footprint = bDef.footprint;
        }
      }
    } else {
      // Savunma kartı
      const bDefId = cardDef.refId as BuildingId;
      const bDef = BUILDINGS[bDefId];
      const activeBuildings = this.buildingManager.getBuildingsOfType('player', bDefId);
      const isLimitReached = activeBuildings.length >= bDef.maxCount;
      const canAfford = this.resourceManager.canAfford('player', bDef.costGold, bDef.costWood);

      if (!isLimitReached && canAfford) {
        buildingId = bDefId;
        footprint = bDef.footprint;
      }
    }

    this.pointerDownCandidate = {
      cardId,
      buildingId: buildingId || ('hq' as BuildingId),
      footprint: footprint || { w: 1, h: 1 },
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
    };
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.pointerDownCandidate || this.pointerDownCandidate.pointerId !== e.pointerId) return;

    const dist = Math.hypot(
      e.clientX - this.pointerDownCandidate.startX,
      e.clientY - this.pointerDownCandidate.startY
    );

    // SPEC S3: 6 pikseli geçince sürükleme başlar
    if (!this.dragState) {
      if (dist >= 6 && this.pointerDownCandidate.buildingId !== 'hq') {
        this.dragState = {
          cardId: this.pointerDownCandidate.cardId,
          buildingId: this.pointerDownCandidate.buildingId,
          footprint: this.pointerDownCandidate.footprint,
          pointerId: this.pointerDownCandidate.pointerId,
          startX: this.pointerDownCandidate.startX,
          startY: this.pointerDownCandidate.startY,
          isDragging: true,
          currentTile: null,
          isValid: false,
        };

        const view = this.cardViews.get(this.dragState.cardId);
        if (view) {
          view.el.classList.add('dragging');
        }

        this.cameraController.setInputEnabled(false);
        this.createGhostMesh(this.dragState.footprint);
      } else {
        return;
      }
    }

    if (!this.dragState || !this.dragState.isDragging) return;

    const tile = this.screenToGroundTile(e.clientX, e.clientY, this.dragState.footprint);
    this.dragState.currentTile = tile;

    if (tile && this.ghostMesh) {
      const fp = this.dragState.footprint;
      this.ghostMesh.position.set(tile.x + fp.w / 2, 0.05, tile.y + fp.h / 2);
      this.ghostMesh.visible = true;

      const check = this.constructionManager.canPlace('player', this.dragState.buildingId, tile);
      this.dragState.isValid = check.ok;

      if (this.ghostMaterial) {
        this.ghostMaterial.color.setHex(check.ok ? 0x22c55e : 0xef4444);
      }
    } else if (this.ghostMesh) {
      this.ghostMesh.visible = false;
      this.dragState.isValid = false;
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.pointerDownCandidate || this.pointerDownCandidate.pointerId !== e.pointerId) return;

    const candidate = this.pointerDownCandidate;
    this.pointerDownCandidate = null;

    if (this.dragState && this.dragState.isDragging) {
      const view = this.cardViews.get(this.dragState.cardId);
      if (view) {
        view.el.classList.remove('dragging');
      }

      this.cameraController.setInputEnabled(true);
      this.removeGhostMesh();

      const panelRect = this.element.getBoundingClientRect();
      const isOverPanel =
        e.clientX >= panelRect.left &&
        e.clientX <= panelRect.right &&
        e.clientY >= panelRect.top &&
        e.clientY <= panelRect.bottom;

      if (!isOverPanel && this.dragState.isValid && this.dragState.currentTile) {
        this.constructionManager.place('player', this.dragState.buildingId, this.dragState.currentTile);
      }

      this.dragState = null;
      this.update();
      return;
    }

    this.dragState = null;

    // SPEC S3: İşaretçi 6 pikselden az hareket ettiyse tıklamadır
    const dist = Math.hypot(e.clientX - candidate.startX, e.clientY - candidate.startY);
    if (dist < 6) {
      this.lastPointerUpHandledTime = performance.now();
      this.handleCardClick(candidate.cardId);
    }
  }

  // SPEC S1, S5, S6: Yenilemede yalnızca metin, sınıf ve çubuk genişliği DEĞİŞTİĞİNDE güncellenir
  public update(): void {
    const timeScale = this.getCurrentTimeScale();

    // 1. Kartların güncellenmesi
    for (const view of this.cardViews.values()) {
      const cardDef = view.cardDef;
      const isAvailable = this.cardManager.isCardAvailable('player', cardDef.id);

      if (cardDef.category === 'asker') {
        const unitDef = UNITS[cardDef.refId as UnitId];
        const prodBuildingId = unitDef.producedAt as BuildingId;
        const bDef = BUILDINGS[prodBuildingId];
        const playerBuildings = this.buildingManager.getBuildingsOfType('player', prodBuildingId);
        const activeBuilding = playerBuildings.find((b) => b.state === 'active');
        const constructingBuilding = playerBuildings.find((b) => b.state === 'constructing');

        if (!activeBuilding) {
          // Üretim binası henüz aktif değil
          const costStr = `${bDef.costGold} / ${bDef.costWood}`;
          const canAfford = this.resourceManager.canAfford('player', bDef.costGold, bDef.costWood);

          if (constructingBuilding) {
            // SPEC S6: Bina inşa ediliyorsa 'İnşa ediliyor', ilerleme çubuğu ve 'Kalan: N sn'
            const simSec = this.constructionManager.getRemainingSimSec(constructingBuilding);
            const realSec = Math.ceil(simSec / timeScale);
            const progressPct = Math.min(100, Math.round(constructingBuilding.constructionProgress * 100));

            this.applyCardUpdates(view, {
              disabled: true,
              statusText: 'İnşa ediliyor',
              statusVisible: true,
              queueBoxVisible: true,
              queueCountText: '',
              remainingText: `Kalan: ${realSec} sn`,
              progressPct,
              stopBtnVisible: false,
              costLabel: 'Maliyet:',
              costVal: costStr,
            });
          } else {
            // Henüz yerleştirilmemiş
            const isPassive = !isAvailable || !canAfford;
            this.applyCardUpdates(view, {
              disabled: isPassive,
              statusText: '',
              statusVisible: false,
              queueBoxVisible: false,
              queueCountText: '',
              remainingText: '',
              progressPct: 0,
              stopBtnVisible: false,
              costLabel: 'Bina:',
              costVal: costStr,
            });
          }
        } else {
          // Üretim binası HAZIR: Asker üretimi
          const costStr = `${unitDef.costGold} / ${unitDef.costWood}`;
          const queue: ProductionQueueItem[] = this.productionManager.getQueue(activeBuilding);
          const canAfford = this.resourceManager.canAfford('player', unitDef.costGold, unitDef.costWood);
          const isQueueFull = queue.length >= 5;
          const isPassive = !isAvailable || !canAfford || isQueueFull;

          if (queue.length > 0) {
            // SPEC S6: Birim üretiliyorsa kuyruğun başındaki birimin ilerleme çubuğu, 'Kalan: N sn' ve 'Kuyruk: n/5'
            const simSec = this.productionManager.getRemainingSimSec(activeBuilding);
            const realSec = Math.ceil(simSec / timeScale);
            const first = queue[0];
            const progressPct = Math.min(100, Math.round((first.progressSec / first.totalSec) * 100));

            this.applyCardUpdates(view, {
              disabled: isPassive,
              statusText: '',
              statusVisible: false,
              queueBoxVisible: true,
              queueCountText: `Kuyruk: ${queue.length}/5`,
              remainingText: `Kalan: ${realSec} sn`,
              progressPct,
              stopBtnVisible: true,
              costLabel: 'Birim:',
              costVal: costStr,
            });
          } else {
            this.applyCardUpdates(view, {
              disabled: isPassive,
              statusText: '',
              statusVisible: false,
              queueBoxVisible: false,
              queueCountText: '',
              remainingText: '',
              progressPct: 0,
              stopBtnVisible: false,
              costLabel: 'Birim:',
              costVal: costStr,
            });
          }
        }
      } else {
        // Savunma kartı (Hisar, Mancınık-ı Azam)
        const bDefId = cardDef.refId as BuildingId;
        const bDef = BUILDINGS[bDefId];
        const costStr = `${bDef.costGold} / ${bDef.costWood}`;
        const playerBuildings = this.buildingManager.getBuildingsOfType('player', bDefId);
        const constructingBuilding = playerBuildings.find((b) => b.state === 'constructing');

        const isLimitReached = playerBuildings.filter((b) => b.state !== 'destroyed').length >= bDef.maxCount;
        const canAfford = this.resourceManager.canAfford('player', bDef.costGold, bDef.costWood);
        const isPassive = !isAvailable || isLimitReached || !canAfford;

        if (constructingBuilding) {
          const simSec = this.constructionManager.getRemainingSimSec(constructingBuilding);
          const realSec = Math.ceil(simSec / timeScale);
          const progressPct = Math.min(100, Math.round(constructingBuilding.constructionProgress * 100));

          this.applyCardUpdates(view, {
            disabled: isPassive,
            statusText: 'İnşa ediliyor',
            statusVisible: true,
            queueBoxVisible: true,
            queueCountText: '',
            remainingText: `Kalan: ${realSec} sn`,
            progressPct,
            stopBtnVisible: false,
            costLabel: 'Bina:',
            costVal: costStr,
          });
        } else {
          this.applyCardUpdates(view, {
            disabled: isPassive,
            statusText: isLimitReached ? 'Kuyruk dolu' : '',
            statusVisible: isLimitReached,
            queueBoxVisible: false,
            queueCountText: '',
            remainingText: '',
            progressPct: 0,
            stopBtnVisible: false,
            costLabel: 'Bina:',
            costVal: costStr,
          });
        }
      }
    }

    // 2. İşçi butonlarının güncellenmesi
    const hq = this.buildingManager.getHq('player');
    const hqQueue = hq ? this.productionManager.getQueue(hq) : [];

    for (const view of this.workerViews.values()) {
      const type = view.type;
      const uDef = UNITS[type];
      const canAdd = hq !== undefined && this.workerManager.canAddWorker('player', type);
      const canAfford = this.resourceManager.canAfford('player', uDef.costGold, uDef.costWood);
      const isQueueFull = hqQueue.length >= 5;
      const shouldBeDisabled = !canAdd || !canAfford || isQueueFull;

      // SPEC S5: Pasif durum değişmediğinde DOM'a dokunma
      if (view.lastDisabled !== shouldBeDisabled) {
        view.lastDisabled = shouldBeDisabled;
        view.btn.classList.toggle('disabled', shouldBeDisabled);
        view.btn.disabled = shouldBeDisabled;
      }

      // SPEC S6: Ana Karargâh işçi düğmeleri de aynı kalan süre ve kuyruk bilgisini gösterir
      const isHead = hq && hqQueue.length > 0 && hqQueue[0].unitId === type;
      const queuedCount = hqQueue.filter((item) => item.unitId === type).length;

      if (isHead) {
        const simSec = this.productionManager.getRemainingSimSec(hq);
        const realSec = Math.ceil(simSec / timeScale);
        const first = hqQueue[0];
        const progressPct = Math.min(100, Math.round((first.progressSec / first.totalSec) * 100));
        const infoText = `Kalan: ${realSec} sn · Kuyruk: ${hqQueue.length}/5`;

        if (!view.lastInfoVisible) {
          view.infoEl.style.display = 'flex';
          view.progressBarEl.style.display = 'block';
          view.lastInfoVisible = true;
        }

        if (view.lastInfoText !== infoText) {
          view.infoEl.textContent = infoText;
          view.lastInfoText = infoText;
        }

        if (view.lastProgressPct !== progressPct) {
          view.progressFillEl.style.width = `${progressPct}%`;
          view.lastProgressPct = progressPct;
        }
      } else if (queuedCount > 0) {
        const infoText = `Kuyruk: ${hqQueue.length}/5`;

        if (!view.lastInfoVisible) {
          view.infoEl.style.display = 'flex';
          view.progressBarEl.style.display = 'none';
          view.lastInfoVisible = true;
        }

        if (view.lastInfoText !== infoText) {
          view.infoEl.textContent = infoText;
          view.lastInfoText = infoText;
        }

        if (view.lastProgressPct !== 0) {
          view.progressFillEl.style.width = '0%';
          view.lastProgressPct = 0;
        }
      } else {
        if (view.lastInfoVisible) {
          view.infoEl.style.display = 'none';
          view.progressBarEl.style.display = 'none';
          view.lastInfoVisible = false;
          view.lastInfoText = '';
          view.progressFillEl.style.width = '0%';
          view.lastProgressPct = 0;
        }
      }
    }
  }

  // DOM değişimlerini kontrol edip yalnızca değişen alanları uygulayan yardımcı fonksiyon
  private applyCardUpdates(
    view: CardItemView,
    updates: {
      disabled: boolean;
      statusText: string;
      statusVisible: boolean;
      queueBoxVisible: boolean;
      queueCountText: string;
      remainingText: string;
      progressPct: number;
      stopBtnVisible: boolean;
      costLabel: string;
      costVal: string;
    }
  ): void {
    // S5: Pasiflik sınıfı
    if (view.lastDisabled !== updates.disabled) {
      view.lastDisabled = updates.disabled;
      view.el.classList.toggle('disabled', updates.disabled);
    }

    // Durum metni
    if (view.lastStatusVisible !== updates.statusVisible) {
      view.lastStatusVisible = updates.statusVisible;
      view.statusEl.style.display = updates.statusVisible ? 'block' : 'none';
    }
    if (updates.statusVisible && view.lastStatusText !== updates.statusText) {
      view.lastStatusText = updates.statusText;
      view.statusEl.textContent = updates.statusText;
    }

    // Kuyruk kutusu
    if (view.lastQueueBoxVisible !== updates.queueBoxVisible) {
      view.lastQueueBoxVisible = updates.queueBoxVisible;
      view.queueBoxEl.style.display = updates.queueBoxVisible ? 'flex' : 'none';
    }

    if (updates.queueBoxVisible) {
      if (view.lastQueueCountText !== updates.queueCountText) {
        view.lastQueueCountText = updates.queueCountText;
        view.queueCountEl.textContent = updates.queueCountText;
      }

      if (view.lastRemainingText !== updates.remainingText) {
        view.lastRemainingText = updates.remainingText;
        view.remainingEl.textContent = updates.remainingText;
      }

      if (view.lastProgressPct !== updates.progressPct) {
        view.lastProgressPct = updates.progressPct;
        view.progressFillEl.style.width = `${updates.progressPct}%`;
      }

      if (view.lastStopBtnVisible !== updates.stopBtnVisible) {
        view.lastStopBtnVisible = updates.stopBtnVisible;
        view.stopBtnEl.style.display = updates.stopBtnVisible ? 'block' : 'none';
      }
    }

    // Maliyet bilgisi
    if (view.lastCostLabel !== updates.costLabel) {
      view.lastCostLabel = updates.costLabel;
      view.costLabelEl.textContent = updates.costLabel;
    }
    if (view.lastCostVal !== updates.costVal) {
      view.lastCostVal = updates.costVal;
      view.costValEl.textContent = updates.costVal;
    }
  }

  private screenToGroundTile(
    clientX: number,
    clientY: number,
    footprint: { w: number; h: number }
  ): TilePos | null {
    const rect = this.canvas.getBoundingClientRect();
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return null;
    }

    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(
      new THREE.Vector2(ndcX, ndcY),
      this.cameraController.getCamera()
    );

    const ray = this.raycaster.ray;

    if (Math.abs(ray.direction.y) < 0.00001) return null;

    const t = -ray.origin.y / ray.direction.y;
    if (t < 0) return null;

    const worldX = ray.origin.x + t * ray.direction.x;
    const worldZ = ray.origin.z + t * ray.direction.z;

    const tileX = Math.floor(worldX - footprint.w / 2);
    const tileY = Math.floor(worldZ - footprint.h / 2);

    return { x: tileX, y: tileY };
  }

  private createGhostMesh(footprint: { w: number; h: number }): void {
    this.removeGhostMesh();

    const geometry = new THREE.PlaneGeometry(footprint.w, footprint.h);
    geometry.rotateX(-Math.PI / 2);

    this.ghostMaterial = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });

    this.ghostMesh = new THREE.Mesh(geometry, this.ghostMaterial);
    this.ghostMesh.visible = false;
    this.sceneManager.getScene().add(this.ghostMesh);
  }

  private removeGhostMesh(): void {
    if (this.ghostMesh) {
      this.sceneManager.getScene().remove(this.ghostMesh);
      this.ghostMesh.geometry.dispose();
      if (this.ghostMaterial) {
        this.ghostMaterial.dispose();
        this.ghostMaterial = null;
      }
      this.ghostMesh = null;
    }
  }

  public destroy(): void {
    if (this.updateInterval !== null) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    for (const view of this.cardViews.values()) {
      if (view.toastTimer !== null) {
        clearTimeout(view.toastTimer);
        view.toastTimer = null;
      }
    }

    for (const view of this.workerViews.values()) {
      if (view.toastTimer !== null) {
        clearTimeout(view.toastTimer);
        view.toastTimer = null;
      }
    }

    window.removeEventListener('pointermove', this.onPointerMoveBound);
    window.removeEventListener('pointerup', this.onPointerUpBound);
    window.removeEventListener('pointercancel', this.onPointerUpBound);

    this.removeGhostMesh();
    this.cameraController.setInputEnabled(true);

    if (this.element.parentElement) {
      this.element.parentElement.removeChild(this.element);
    }
  }
}
