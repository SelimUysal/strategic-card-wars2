import { BuildingManager } from '../buildings/BuildingManager';
import { CameraController } from '../core/CameraController';
import { UnitManager } from '../units/UnitManager';
import { FogOfWar } from '../world/FogOfWar';
import { GameMap } from '../world/MapConfig';

export class Minimap {
  private element: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private updateInterval: number | null = null;
  private isDragging: boolean = false;

  private onPointerDownBound: (e: PointerEvent) => void;
  private onPointerMoveBound: (e: PointerEvent) => void;
  private onPointerUpBound: (e: PointerEvent) => void;

  constructor(
    private parent: HTMLElement,
    private map: GameMap,
    private fogOfWar: FogOfWar,
    private unitManager: UnitManager,
    private buildingManager: BuildingManager,
    private cameraController: CameraController,
    private playerColorHex: string = '#10b981',
    private enemyColorHex: string = '#e11d48'
  ) {
    this.element = document.createElement('div');
    this.element.className = 'minimap-wrapper';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap-canvas';

    const canvasWidth = 140;
    const canvasHeight = Math.round((this.map.height / this.map.width) * canvasWidth);

    this.canvas.width = canvasWidth;
    this.canvas.height = canvasHeight;
    this.canvas.style.width = `${canvasWidth}px`;
    this.canvas.style.height = `${canvasHeight}px`;

    this.element.appendChild(this.canvas);
    this.parent.appendChild(this.element);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Minimap 2B canvas bağlamı alınamadı.');
    }
    this.ctx = ctx;

    this.onPointerDownBound = (e: PointerEvent) => {
      e.stopPropagation();
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch (_) {}
      this.isDragging = true;
      this.handleMinimapInteraction(e);
    };

    this.onPointerMoveBound = (e: PointerEvent) => {
      e.stopPropagation();
      if (this.isDragging) {
        this.handleMinimapInteraction(e);
      }
    };

    this.onPointerUpBound = (e: PointerEvent) => {
      e.stopPropagation();
      this.isDragging = false;
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch (_) {}
    };

    this.canvas.addEventListener('pointerdown', this.onPointerDownBound);
    this.canvas.addEventListener('pointermove', this.onPointerMoveBound);
    this.canvas.addEventListener('pointerup', this.onPointerUpBound);
    this.canvas.addEventListener('pointercancel', this.onPointerUpBound);

    this.draw();

    // Saniyede yaklaşık 10 kez yenilenir (100 ms)
    this.updateInterval = window.setInterval(() => {
      this.draw();
    }, 100);
  }

  private handleMinimapInteraction(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const ratioX = (e.clientX - rect.left) / rect.width;
    const ratioY = (e.clientY - rect.top) / rect.height;

    const targetX = Math.max(0, Math.min(this.map.width, ratioX * this.map.width));
    const targetY = Math.max(0, Math.min(this.map.height, ratioY * this.map.height));

    this.cameraController.focusOn(targetX, targetY);
  }

  public draw(): void {
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const scaleX = cw / this.map.width;
    const scaleY = ch / this.map.height;

    // 1. Zemin tipleri ve sis maskesi
    const isFogActive = this.fogOfWar.isFogActive();
    const exploredMask = this.fogOfWar.getExploredMask();

    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const idx = y * this.map.width + x;

        // Sis aktifken keşfedilmemiş kareler karartılır
        if (isFogActive && exploredMask[idx] === 0) {
          this.ctx.fillStyle = '#0f0f12';
        } else {
          const tile = this.map.getTile(x, y);
          if (!tile) continue;

          switch (tile.type) {
            case 'flat':
              this.ctx.fillStyle = '#3e7d32'; // düz: yeşil
              break;
            case 'forest':
              this.ctx.fillStyle = '#1b4317'; // orman: koyu yeşil
              break;
            case 'blocked':
              this.ctx.fillStyle = '#5a5a66'; // engelli: gri
              break;
            case 'passage':
              this.ctx.fillStyle = '#8b5a2b'; // geçit/köprü: kahverengi
              break;
            default:
              this.ctx.fillStyle = '#3e7d32';
          }
        }

        this.ctx.fillRect(x * scaleX, y * scaleY, Math.ceil(scaleX), Math.ceil(scaleY));
      }
    }

    // 2. Binalar (Ana Karargâh belirgin işaretle gösterilir)
    const allBuildings = this.buildingManager.getBuildings();
    for (const b of allBuildings) {
      if (b.state === 'destroyed') continue;

      if (b.team === 'enemy' && !this.fogOfWar.canPlayerSee(b)) {
        continue;
      }

      const rect = b.getRect();
      if (b.defId === 'hq') {
        this.ctx.fillStyle = b.team === 'player' ? this.playerColorHex : this.enemyColorHex;
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 1.5;
        const hx = (rect.x + rect.w / 2) * scaleX;
        const hy = (rect.y + rect.h / 2) * scaleY;
        const hw = Math.max(6, rect.w * scaleX * 1.3);
        const hh = Math.max(6, rect.h * scaleY * 1.3);

        this.ctx.fillRect(hx - hw / 2, hy - hh / 2, hw, hh);
        this.ctx.strokeRect(hx - hw / 2, hy - hh / 2, hw, hh);
      } else {
        this.ctx.fillStyle = b.team === 'player' ? this.playerColorHex : this.enemyColorHex;
        this.ctx.fillRect(
          rect.x * scaleX,
          rect.y * scaleY,
          Math.max(2, rect.w * scaleX),
          Math.max(2, rect.h * scaleY)
        );
      }
    }

    // 3. Birimler
    const pUnits = this.unitManager.getUnits('player');
    this.ctx.fillStyle = this.playerColorHex;
    for (const u of pUnits) {
      if (u.state === 'dead') continue;
      this.ctx.fillRect(u.pos.x * scaleX - 1, u.pos.y * scaleY - 1, 2.5, 2.5);
    }

    const eUnits = this.unitManager.getUnits('enemy');
    this.ctx.fillStyle = this.enemyColorHex;
    for (const u of eUnits) {
      if (u.state === 'dead') continue;
      if (this.fogOfWar.canPlayerSee(u)) {
        this.ctx.fillRect(u.pos.x * scaleX - 1, u.pos.y * scaleY - 1, 2.5, 2.5);
      }
    }

    // 4. S3: Kameranın görüş alanı çerçevesi (Viewport rectangle)
    const corners = this.cameraController.getViewportGroundCorners();
    if (corners.length === 4) {
      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const cx = corners[i].x * scaleX;
        const cy = corners[i].y * scaleY;
        if (i === 0) this.ctx.moveTo(cx, cy);
        else this.ctx.lineTo(cx, cy);
      }
      this.ctx.closePath();
      this.ctx.stroke();
    }
  }

  public destroy(): void {
    if (this.updateInterval !== null) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    this.canvas.removeEventListener('pointerdown', this.onPointerDownBound);
    this.canvas.removeEventListener('pointermove', this.onPointerMoveBound);
    this.canvas.removeEventListener('pointerup', this.onPointerUpBound);
    this.canvas.removeEventListener('pointercancel', this.onPointerUpBound);

    if (this.element.parentElement) {
      this.element.parentElement.removeChild(this.element);
    }
  }
}
