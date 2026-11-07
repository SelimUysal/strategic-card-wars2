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

export class CardPanel {
  private element: HTMLElement;
  private cardListEl: HTMLElement;
  private workerPanelEl: HTMLElement;

  private updateInterval: number | null = null;
  private dragState: DragState | null = null;

  private ghostMesh: THREE.Mesh | null = null;
  private ghostMaterial: THREE.MeshBasicMaterial | null = null;
  private raycaster: THREE.Raycaster = new THREE.Raycaster();

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

    this.setupWorkerButtons();
    this.update();

    // Saniyede yaklaşık 10 kez yenilenir (100 ms)
    this.updateInterval = window.setInterval(() => {
      this.update();
    }, 100);
  }

  // İşçi butonları: 'Altın Madencisi' ve 'Oduncu' (maliyet 30 / 30)
  private setupWorkerButtons(): void {
    const goldMinerDef = UNITS.altin_madencisi;
    const woodcutterDef = UNITS.oduncu;

    this.workerPanelEl.innerHTML = `
      <button type="button" class="worker-btn" data-worker="altin_madencisi">
        <span class="worker-btn-name">Altın Madencisi</span>
        <span class="worker-btn-cost">${goldMinerDef.costGold} / ${goldMinerDef.costWood}</span>
      </button>
      <button type="button" class="worker-btn" data-worker="oduncu">
        <span class="worker-btn-name">Oduncu</span>
        <span class="worker-btn-cost">${woodcutterDef.costGold} / ${woodcutterDef.costWood}</span>
      </button>
    `;

    const goldMinerBtn = this.workerPanelEl.querySelector('[data-worker="altin_madencisi"]') as HTMLButtonElement;
    const woodcutterBtn = this.workerPanelEl.querySelector('[data-worker="oduncu"]') as HTMLButtonElement;

    goldMinerBtn.addEventListener('click', () => {
      this.enqueueWorker('altin_madencisi');
    });

    woodcutterBtn.addEventListener('click', () => {
      this.enqueueWorker('oduncu');
    });
  }

  private enqueueWorker(type: 'altin_madencisi' | 'oduncu'): void {
    const hq = this.buildingManager.getHq('player');
    if (!hq) return;

    if (!this.workerManager.canAddWorker('player', type)) return;

    const uDef = UNITS[type];
    if (!this.resourceManager.canAfford('player', uDef.costGold, uDef.costWood)) return;

    this.productionManager.enqueue('player', hq, type);
    this.update();
  }

  public update(): void {
    // 1. İşçi butonları durumu
    const goldMinerBtn = this.workerPanelEl.querySelector('[data-worker="altin_madencisi"]') as HTMLButtonElement;
    const woodcutterBtn = this.workerPanelEl.querySelector('[data-worker="oduncu"]') as HTMLButtonElement;

    if (goldMinerBtn && woodcutterBtn) {
      const hq = this.buildingManager.getHq('player');
      const canAddGold =
        hq !== undefined &&
        this.workerManager.canAddWorker('player', 'altin_madencisi') &&
        this.resourceManager.canAfford('player', UNITS.altin_madencisi.costGold, UNITS.altin_madencisi.costWood);

      const canAddWood =
        hq !== undefined &&
        this.workerManager.canAddWorker('player', 'oduncu') &&
        this.resourceManager.canAfford('player', UNITS.oduncu.costGold, UNITS.oduncu.costWood);

      if (canAddGold) {
        goldMinerBtn.classList.remove('disabled');
        goldMinerBtn.disabled = false;
      } else {
        goldMinerBtn.classList.add('disabled');
        goldMinerBtn.disabled = true;
      }

      if (canAddWood) {
        woodcutterBtn.classList.remove('disabled');
        woodcutterBtn.disabled = false;
      } else {
        woodcutterBtn.classList.add('disabled');
        woodcutterBtn.disabled = true;
      }
    }

    // Sürükleme anında DOM'u yeniden oluşturmayalım (pointer event kopmaması için)
    if (this.dragState?.isDragging) {
      return;
    }

    // 2. Destede en fazla 5 kart
    const deck = this.deckManager.getDeck().slice(0, 5);

    // Kart listesini güncelle
    this.cardListEl.innerHTML = '';

    for (const cardId of deck) {
      const cardDef = CARDS[cardId];
      if (!cardDef) continue;

      const cardEl = this.createCardElement(cardDef);
      this.cardListEl.appendChild(cardEl);
    }
  }

  private createCardElement(cardDef: CardDef): HTMLElement {
    const cardEl = document.createElement('div');
    cardEl.className = 'game-card';
    cardEl.setAttribute('data-card-id', cardDef.id);

    const isAvailable = this.cardManager.isCardAvailable('player', cardDef.id);

    if (cardDef.category === 'asker') {
      const unitDef = UNITS[cardDef.refId as UnitId];
      const prodBuildingId = unitDef.producedAt as BuildingId;
      const bDef = BUILDINGS[prodBuildingId];

      const playerBuildings = this.buildingManager.getBuildingsOfType('player', prodBuildingId);
      const activeBuilding = playerBuildings.find((b) => b.state === 'active');
      const constructingBuilding = playerBuildings.find((b) => b.state === 'constructing');

      if (!activeBuilding) {
        // Üretim binası KURULMAMIŞSA
        const costStr = `${bDef.costGold} / ${bDef.costWood}`;
        const canAfford = this.resourceManager.canAfford('player', bDef.costGold, bDef.costWood);

        if (constructingBuilding) {
          // İnşa ediliyor durumu
          cardEl.classList.add('disabled');
          cardEl.innerHTML = `
            <div>
              <div class="game-card-name">${cardDef.nameTr}</div>
              <div class="game-card-role">${cardDef.roleTr}</div>
              <div class="game-card-status">İnşa ediliyor</div>
            </div>
            <div class="game-card-cost"><span>Maliyet:</span><span>${costStr}</span></div>
          `;
        } else {
          // Henüz yerleştirilmemiş
          const isPassive = !isAvailable || !canAfford;
          if (isPassive) cardEl.classList.add('disabled');

          cardEl.innerHTML = `
            <div>
              <div class="game-card-name">${cardDef.nameTr}</div>
              <div class="game-card-role">${cardDef.roleTr}</div>
            </div>
            <div class="game-card-cost"><span>Bina:</span><span>${costStr}</span></div>
          `;

          // Sürükle-bırak ile bina yerleştirme
          cardEl.addEventListener('pointerdown', (e: PointerEvent) => {
            if (isPassive) return;
            this.startDrag(e, cardDef.id, prodBuildingId, bDef.footprint);
          });
        }
      } else {
        // Üretim binası HAZIRSA
        const costStr = `${unitDef.costGold} / ${unitDef.costWood}`;
        const queue: ProductionQueueItem[] = this.productionManager.getQueue(activeBuilding);
        const canAfford = this.resourceManager.canAfford('player', unitDef.costGold, unitDef.costWood);
        const isQueueFull = queue.length >= 5;
        const isPassive = !isAvailable || !canAfford || isQueueFull;

        if (isPassive) cardEl.classList.add('disabled');

        let queueHtml = '';
        if (queue.length > 0) {
          const first = queue[0];
          const progressPct = Math.min(100, (first.progressSec / first.totalSec) * 100);
          queueHtml = `
            <div class="game-card-queue-box">
              <div class="game-card-queue-text">
                <span>Kuyruk: ${queue.length}/5</span>
              </div>
              <div class="game-card-progress-bar">
                <div class="game-card-progress-fill" style="width: ${progressPct}%"></div>
              </div>
              <button type="button" class="game-card-stop-btn" data-action="stop-prod">Durdur</button>
            </div>
          `;
        }

        cardEl.innerHTML = `
          <div>
            <div class="game-card-name">${cardDef.nameTr}</div>
            <div class="game-card-role">${cardDef.roleTr}</div>
            ${queueHtml}
          </div>
          <div class="game-card-cost"><span>Birim:</span><span>${costStr}</span></div>
        `;

        // Karta dokunma/tıklama: 1 birimi kuyruğa ekler
        cardEl.addEventListener('click', (e: MouseEvent) => {
          const target = e.target as HTMLElement;
          if (target && target.getAttribute('data-action') === 'stop-prod') {
            e.stopPropagation();
            this.productionManager.stopProduction(activeBuilding);
            this.update();
            return;
          }

          if (isPassive) return;
          this.productionManager.enqueue('player', activeBuilding, unitDef.id);
          this.update();
        });
      }
    } else {
      // Savunma kartı (Hisar, Mancınık-ı Azam)
      const bDefId = cardDef.refId as BuildingId;
      const bDef = BUILDINGS[bDefId];
      const costStr = `${bDef.costGold} / ${bDef.costWood}`;

      const activeBuildings = this.buildingManager.getBuildingsOfType('player', bDefId);
      const isLimitReached = activeBuildings.length >= bDef.maxCount;
      const canAfford = this.resourceManager.canAfford('player', bDef.costGold, bDef.costWood);
      const isPassive = !isAvailable || isLimitReached || !canAfford;

      if (isPassive) cardEl.classList.add('disabled');

      cardEl.innerHTML = `
        <div>
          <div class="game-card-name">${cardDef.nameTr}</div>
          <div class="game-card-role">${cardDef.roleTr}</div>
          ${isLimitReached ? '<div class="game-card-status">Sınır Dolu</div>' : ''}
        </div>
        <div class="game-card-cost"><span>Bina:</span><span>${costStr}</span></div>
      `;

      cardEl.addEventListener('pointerdown', (e: PointerEvent) => {
        if (isPassive) return;
        this.startDrag(e, cardDef.id, bDefId, bDef.footprint);
      });
    }

    return cardEl;
  }

  private startDrag(
    e: PointerEvent,
    cardId: CardId,
    buildingId: BuildingId,
    footprint: { w: number; h: number }
  ): void {
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    this.dragState = {
      cardId,
      buildingId,
      footprint,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      isDragging: false,
      currentTile: null,
      isValid: false,
    };
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.dragState || this.dragState.pointerId !== e.pointerId) return;

    // Sürükleme eşiği (5 piksel)
    if (!this.dragState.isDragging) {
      const dist = Math.hypot(e.clientX - this.dragState.startX, e.clientY - this.dragState.startY);
      if (dist > 5) {
        this.dragState.isDragging = true;
        this.cameraController.setInputEnabled(false);
        this.createGhostMesh(this.dragState.footprint);
      } else {
        return;
      }
    }

    // Ekran konumunu harita karesine çevir
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
    if (!this.dragState || this.dragState.pointerId !== e.pointerId) return;

    if (this.dragState.isDragging) {
      this.cameraController.setInputEnabled(true);
      this.removeGhostMesh();

      // Kart panelinin üstünde bırakıldıysa yerleştirme iptal
      const panelRect = this.element.getBoundingClientRect();
      const isOverPanel =
        e.clientX >= panelRect.left &&
        e.clientX <= panelRect.right &&
        e.clientY >= panelRect.top &&
        e.clientY <= panelRect.bottom;

      if (!isOverPanel && this.dragState.isValid && this.dragState.currentTile) {
        this.constructionManager.place(
          'player',
          this.dragState.buildingId,
          this.dragState.currentTile
        );
      }
    }

    this.dragState = null;
    this.update();
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

    // y = 0 düzlemi ile kesişim (zemin düzlemi)
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
