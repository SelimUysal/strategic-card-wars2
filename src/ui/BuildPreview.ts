import * as THREE from 'three';
import { BuildingPlacementValidity, ConstructionManager } from '../buildings/ConstructionManager';
import { BuildingModels } from '../render/BuildingModels';
import { BUILDINGS } from '../data/buildings';
import { MATCH_RULES } from '../data/matchRules';
import { BuildingId, TilePos } from '../types';

export class BuildPreview {
  private previewGroup: THREE.Group;
  private ghostModelGroup: THREE.Group | null = null;
  private footprintGroup: THREE.Group | null = null;
  private zoneRingMesh: THREE.Mesh | null = null;
  private tooltipEl: HTMLElement | null = null;

  private currentBuildingId: BuildingId | null = null;
  private currentTile: TilePos | null = null;
  private currentValidity: BuildingPlacementValidity | null = null;

  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private groundPlane: THREE.Plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private intersectionPoint: THREE.Vector3 = new THREE.Vector3();

  // TASARIM KARARI:
  // UYGUN (Valid) = Parlak Camgöbeği (Cyan) 0x00f0ff (#00f0ff)
  // UYGUN DEĞİL (Invalid) = Parlak Kırmızı (Red) 0xef4444 (#ef4444)
  // Yeşil renk zemin çimeniyle karışacağı için kesinlikle KULLANILMAZ.
  private ghostMatValid: THREE.MeshBasicMaterial;
  private ghostMatInvalid: THREE.MeshBasicMaterial;
  private tileMatValid: THREE.MeshBasicMaterial;
  private tileMatInvalid: THREE.MeshBasicMaterial;
  private lineMatValid: THREE.LineBasicMaterial;
  private lineMatInvalid: THREE.LineBasicMaterial;

  private tileGeom: THREE.PlaneGeometry;
  private tileEdgeGeom: THREE.EdgesGeometry;
  private ringGeom: THREE.RingGeometry | null = null;
  private ringMat: THREE.MeshBasicMaterial | null = null;

  private tileMeshes: Array<{
    dx: number;
    dy: number;
    quad: THREE.Mesh;
    border: THREE.LineSegments;
  }> = [];

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.Camera,
    private canvas: HTMLCanvasElement,
    private constructionManager: ConstructionManager
  ) {
    this.previewGroup = new THREE.Group();
    this.previewGroup.name = 'BuildPreviewGroup';
    this.scene.add(this.previewGroup);

    // S1: Hayalet materyalleri
    this.ghostMatValid = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    this.ghostMatInvalid = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });

    // S2: Ayak izi materyalleri (depthTest: false, renderOrder: 996)
    this.tileMatValid = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      depthTest: false,
    });
    this.tileMatInvalid = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      depthTest: false,
    });

    this.lineMatValid = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      depthTest: false,
      linewidth: 2,
    });
    this.lineMatInvalid = new THREE.LineBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      depthTest: false,
      linewidth: 2,
    });

    // Hücre geometrileri: 0.94 x 0.94 (aralarında ince boşlukla hücre ayrımı belirginleşir)
    this.tileGeom = new THREE.PlaneGeometry(0.94, 0.94);
    this.tileGeom.rotateX(-Math.PI / 2);

    this.tileEdgeGeom = new THREE.EdgesGeometry(this.tileGeom);

    // S5: Yüzen açıklayıcı ipucu DOM elemanı
    this.createTooltipElement();
  }

  // S5: Tooltip elemanını DOM'a ekle
  private createTooltipElement(): void {
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'build-preview-tooltip';
    this.tooltipEl.style.display = 'none';
    document.body.appendChild(this.tooltipEl);
  }

  // S1 - S4: Sürükleme başlangıcında görsel ögeleri kur
  public start(buildingId: BuildingId): void {
    this.currentBuildingId = buildingId;
    const def = BUILDINGS[buildingId];
    if (!def) return;

    // 1. Hayalet bina modeli (S1)
    if (this.ghostModelGroup) {
      this.previewGroup.remove(this.ghostModelGroup);
    }
    this.ghostModelGroup = BuildingModels.createBuildingVisualModel(
      buildingId,
      this.ghostMatValid
    );
    this.ghostModelGroup.visible = false;
    this.previewGroup.add(this.ghostModelGroup);

    // 2. Ayak izi ızgarası (S2, S3)
    if (this.footprintGroup) {
      this.previewGroup.remove(this.footprintGroup);
    }
    this.footprintGroup = new THREE.Group();
    this.footprintGroup.name = 'FootprintGroup';
    this.tileMeshes = [];

    const w = def.footprint.w;
    const h = def.footprint.h;

    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const quad = new THREE.Mesh(this.tileGeom, this.tileMatValid);
        quad.renderOrder = 995;
        quad.frustumCulled = false;

        const border = new THREE.LineSegments(this.tileEdgeGeom, this.lineMatValid);
        border.renderOrder = 996;
        border.frustumCulled = false;

        quad.position.set(dx + 0.5, 0.04, dy + 0.5);
        border.position.set(dx + 0.5, 0.045, dy + 0.5);

        this.footprintGroup.add(quad);
        this.footprintGroup.add(border);

        this.tileMeshes.push({
          dx,
          dy,
          quad,
          border,
        });
      }
    }

    this.footprintGroup.visible = false;
    this.previewGroup.add(this.footprintGroup);

    // 3. Yerleştirme bölgesi halkası (S4)
    this.createPlacementZoneRing();
  }

  // S4: Yerleştirme bölgesi halkası (HQ merkezli, yarıçap MATCH_RULES.placementZoneRadius)
  private createPlacementZoneRing(): void {
    if (this.zoneRingMesh) {
      this.previewGroup.remove(this.zoneRingMesh);
      if (this.ringGeom) this.ringGeom.dispose();
      if (this.ringMat) this.ringMat.dispose();
      this.zoneRingMesh = null;
    }

    const map = this.constructionManager.getMap();
    const hqCenter = map.getHqCenter('player');
    const radius = MATCH_RULES.placementZoneRadius;

    // İnce ve zarif halka
    this.ringGeom = new THREE.RingGeometry(radius - 0.18, radius + 0.18, 128);
    this.ringGeom.rotateX(-Math.PI / 2);

    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });

    this.zoneRingMesh = new THREE.Mesh(this.ringGeom, this.ringMat);
    this.zoneRingMesh.position.set(hqCenter.x, 0.03, hqCenter.y);
    this.zoneRingMesh.renderOrder = 994;
    this.zoneRingMesh.frustumCulled = false;
    this.previewGroup.add(this.zoneRingMesh);
  }

  // S1, S2, S3, S5, S6: Ekran koordinatlarına göre önizlemeyi güncelle
  public update(clientX: number, clientY: number, isTouch: boolean): void {
    if (!this.currentBuildingId) return;

    // S6: Dokunmatik cihazlarda parmak ofseti (clientY - 60)
    const effectiveClientY = isTouch ? clientY - 60 : clientY;

    // 1. Zemin karesini raycast ile bul
    const tile = this.screenToGroundTile(clientX, effectiveClientY);
    this.currentTile = tile;

    // S2: Kenarlık hafif nabız (pulse) atar
    const pulse = 0.65 + 0.35 * Math.sin(performance.now() * 0.008);
    this.lineMatValid.opacity = pulse;
    this.lineMatInvalid.opacity = pulse;

    if (!tile) {
      this.hideVisuals();
      return;
    }

    // 2. S3: Kare bazlı uygunluk sorgusu
    const validity = this.constructionManager.getTileValidity(
      'player',
      this.currentBuildingId,
      tile
    );
    this.currentValidity = validity;

    const def = BUILDINGS[this.currentBuildingId];
    const w = def.footprint.w;
    const h = def.footprint.h;

    // 3. S1: Hayalet bina konumlandırma ve renklendirme
    if (this.ghostModelGroup) {
      this.ghostModelGroup.visible = true;
      // Binanın merkezi
      this.ghostModelGroup.position.set(tile.x + w / 2, 0.02, tile.y + h / 2);

      const targetMat = validity.isValid ? this.ghostMatValid : this.ghostMatInvalid;
      this.ghostModelGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = targetMat;
        }
      });
    }

    // 4. S2 & S3: Ayak izi karelerini konumlandırma ve her kareyi tekil boyama
    if (this.footprintGroup) {
      this.footprintGroup.visible = true;
      this.footprintGroup.position.set(tile.x, 0, tile.y);

      // validity.tiles içindeki koordinatlara göre eşleştir
      for (const item of this.tileMeshes) {
        const tx = tile.x + item.dx;
        const ty = tile.y + item.dy;
        const tileDetail = validity.tiles.find((t) => t.x === tx && t.y === ty);
        const isThisTileValid = tileDetail ? tileDetail.isValid : false;

        item.quad.material = isThisTileValid ? this.tileMatValid : this.tileMatInvalid;
        item.border.material = isThisTileValid ? this.lineMatValid : this.lineMatInvalid;
      }
    }

    // 5. S5: Açıklayıcı ipucu (tooltip)
    this.updateTooltip(clientX, effectiveClientY, validity);
  }

  // S5: Açıklayıcı ipucu metni ve konumu
  private updateTooltip(
    screenX: number,
    screenY: number,
    validity: BuildingPlacementValidity
  ): void {
    if (!this.tooltipEl) return;

    if (validity.isValid || !validity.reasonText) {
      this.tooltipEl.style.display = 'none';
      return;
    }

    this.tooltipEl.textContent = validity.reasonText;
    this.tooltipEl.style.display = 'block';

    // İmlecin veya parmak ofset noktasının biraz üstünde ve ortalanmış konumlanır
    this.tooltipEl.style.left = `${Math.round(screenX)}px`;
    this.tooltipEl.style.top = `${Math.round(screenY - 14)}px`;
  }

  private hideVisuals(): void {
    if (this.ghostModelGroup) this.ghostModelGroup.visible = false;
    if (this.footprintGroup) this.footprintGroup.visible = false;
    if (this.tooltipEl) this.tooltipEl.style.display = 'none';
    this.currentValidity = null;
  }

  private screenToGroundTile(clientX: number, clientY: number): TilePos | null {
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

    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, this.intersectionPoint);
    if (!hit) return null;

    if (!this.currentBuildingId) return null;
    const def = BUILDINGS[this.currentBuildingId];
    if (!def) return null;

    // Binanın sol-üst köşe karesini bul
    const tileX = Math.floor(hit.x - def.footprint.w / 2);
    const tileY = Math.floor(hit.z - def.footprint.h / 2);

    return { x: tileX, y: tileY };
  }

  public getCurrentTile(): TilePos | null {
    return this.currentTile;
  }

  public isValid(): boolean {
    return this.currentValidity ? this.currentValidity.isValid : false;
  }

  // S3: Bırakma başarısızlığı için son geçerlilik verisini ve gerekçesini döndürür
  public getValidity(): BuildingPlacementValidity | null {
    return this.currentValidity;
  }

  // S7: Temizlik: bellek sızıntısı kalmaz
  public destroy(): void {
    this.hideVisuals();

    if (this.tooltipEl && this.tooltipEl.parentElement) {
      this.tooltipEl.parentElement.removeChild(this.tooltipEl);
      this.tooltipEl = null;
    }

    if (this.ghostModelGroup) {
      this.previewGroup.remove(this.ghostModelGroup);
      this.ghostModelGroup = null;
    }

    if (this.footprintGroup) {
      this.previewGroup.remove(this.footprintGroup);
      this.footprintGroup = null;
    }

    if (this.zoneRingMesh) {
      this.previewGroup.remove(this.zoneRingMesh);
      this.zoneRingMesh = null;
    }

    if (this.ringGeom) {
      this.ringGeom.dispose();
      this.ringGeom = null;
    }
    if (this.ringMat) {
      this.ringMat.dispose();
      this.ringMat = null;
    }

    this.ghostMatValid.dispose();
    this.ghostMatInvalid.dispose();
    this.tileMatValid.dispose();
    this.tileMatInvalid.dispose();
    this.lineMatValid.dispose();
    this.lineMatInvalid.dispose();

    this.tileGeom.dispose();
    this.tileEdgeGeom.dispose();

    this.scene.remove(this.previewGroup);
    this.previewGroup.clear();
  }
}
