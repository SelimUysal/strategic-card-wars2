import * as THREE from 'three';
import { CameraController } from '../core/CameraController';
import { UNITS } from '../data/units';
import { Team, UnitId } from '../types';
import { Unit } from '../units/Unit';
import { FogOfWar } from '../world/FogOfWar';
import { UnitModels } from '../render/UnitModels';

export class UnitOverlay {
  private group: THREE.Group;
  private readonly MAX_INSTANCES = 250;

  // Çubuklar için InstancedMesh nesneleri (S1, S3)
  private barBgMesh: THREE.InstancedMesh;
  private barFillGreenMesh: THREE.InstancedMesh;
  private barFillYellowMesh: THREE.InstancedMesh;
  private barFillRedMesh: THREE.InstancedMesh;

  // Rozetler için tek doku atlası ve InstancedMesh koleksiyonu (S2, S3)
  private atlasTexture: THREE.CanvasTexture;
  private atlasMaterial: THREE.MeshBasicMaterial;
  private badgeMeshes: Map<string, THREE.InstancedMesh> = new Map();

  // Matris ve vektör hesaplama yardımcıları (çöp toplayıcı yükünü önlemek için)
  private dummyMatrix = new THREE.Matrix4();
  private dummyPos = new THREE.Vector3();
  private dummyQuat = new THREE.Quaternion();
  private dummyScale = new THREE.Vector3();
  private screenUp = new THREE.Vector3();
  private screenRight = new THREE.Vector3();
  private tempVec = new THREE.Vector3();

  // Geometri ve materyal referansları (temizleme için)
  private bgGeom: THREE.BufferGeometry;
  private fillGeom: THREE.BufferGeometry;
  private badgeGeoms: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];

  // DOM tarafında kart köşelerinde kullanılmak üzere önceden oluşturulmuş veri URL'leri (S2)
  private static cachedDataUrls: Map<string, string> = new Map();

  // 8 birim türü sabit listesi
  private static readonly UNIT_IDS: UnitId[] = [
    'altin_madencisi',
    'oduncu',
    'tirendaz',
    'yenicheri',
    'deliler',
    'sahi',
    'zirhli_fil',
    'fetih_gemisi',
  ];

  constructor(
    private scene: THREE.Scene,
    private cameraController: CameraController,
    private fogOfWar?: FogOfWar,
    private playerColorHex: number | string = 0x2563eb,
    private enemyColorHex: number | string = 0xdc2626
  ) {
    this.group = new THREE.Group();
    this.group.name = 'UnitOverlayGroup';

    // 1. Doku atlasını oluştur (S2)
    const atlasCanvas = this.createTextureAtlas();
    this.atlasTexture = new THREE.CanvasTexture(atlasCanvas);
    this.atlasTexture.generateMipmaps = true;
    this.atlasTexture.minFilter = THREE.LinearMipmapLinearFilter;
    this.atlasTexture.magFilter = THREE.LinearFilter;

    this.atlasMaterial = new THREE.MeshBasicMaterial({
      map: this.atlasTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.materials.push(this.atlasMaterial);

    // 2. Can çubuğu geometrileri ve materyalleri (S1, S3)
    // Koyu arka plan: 0.86 x 0.14
    this.bgGeom = new THREE.PlaneGeometry(0.86, 0.14);
    const bgMat = new THREE.MeshBasicMaterial({
      color: 0x0f172a,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.85,
    });
    this.materials.push(bgMat);

    this.barBgMesh = new THREE.InstancedMesh(this.bgGeom, bgMat, this.MAX_INSTANCES);
    this.barBgMesh.renderOrder = 1001;
    this.barBgMesh.frustumCulled = false;
    this.barBgMesh.count = 0;
    this.group.add(this.barBgMesh);

    // İç dolgu çubuğu: 0.80 x 0.08, soldan sağa uzaması için x ekseninde sola yaslı
    this.fillGeom = new THREE.PlaneGeometry(0.80, 0.08);
    this.fillGeom.translate(0.40, 0, 0); // Merkez sol kenara alınır

    // SPEC S1 Renkleri: > %60 yeşil, %30-%60 sarı, < %30 kırmızı
    const greenMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.95,
    });
    const yellowMat = new THREE.MeshBasicMaterial({
      color: 0xeab308,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.95,
    });
    const redMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.95,
    });
    this.materials.push(greenMat, yellowMat, redMat);

    this.barFillGreenMesh = new THREE.InstancedMesh(this.fillGeom, greenMat, this.MAX_INSTANCES);
    this.barFillGreenMesh.renderOrder = 1002;
    this.barFillGreenMesh.frustumCulled = false;
    this.barFillGreenMesh.count = 0;
    this.group.add(this.barFillGreenMesh);

    this.barFillYellowMesh = new THREE.InstancedMesh(this.fillGeom, yellowMat, this.MAX_INSTANCES);
    this.barFillYellowMesh.renderOrder = 1002;
    this.barFillYellowMesh.frustumCulled = false;
    this.barFillYellowMesh.count = 0;
    this.group.add(this.barFillYellowMesh);

    this.barFillRedMesh = new THREE.InstancedMesh(this.fillGeom, redMat, this.MAX_INSTANCES);
    this.barFillRedMesh.renderOrder = 1002;
    this.barFillRedMesh.frustumCulled = false;
    this.barFillRedMesh.count = 0;
    this.group.add(this.barFillRedMesh);

    // 3. Rozet InstancedMesh nesneleri (8 birim türü x 2 takım = 16 mesh) (S2, S3)
    this.initBadgeMeshes();

    this.scene.add(this.group);
  }

  // SPEC S2: DOM kart panelinde kullanılmak üzere atlas simgesinin veri URL'sini döndürür [EK]
  public static getIconDataUrl(unitId: string, team: Team = 'player'): string {
    const key = `${unitId}_${team}`;
    const cached = UnitOverlay.cachedDataUrls.get(key);
    if (cached) return cached;

    // Eğer henüz atlas oluşturulmamışsa anlık tekil simge oluştur ve önbelleğe al
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const color = team === 'player' ? '#2563eb' : '#dc2626';
      UnitOverlay.drawBadge(ctx, 48, 48, 44, color, unitId as UnitId);
      const url = canvas.toDataURL('image/png');
      UnitOverlay.cachedDataUrls.set(key, url);
      return url;
    }
    return '';
  }

  // 16 hücreli tek doku atlasını oluşturan canvas 2D çizimi (1024 x 256 piksel)
  private createTextureAtlas(): HTMLCanvasElement {
    const atlas = document.createElement('canvas');
    atlas.width = 1280;
    atlas.height = 256;
    const ctx = atlas.getContext('2d')!;

    const playerColor = typeof this.playerColorHex === 'number'
      ? '#' + this.playerColorHex.toString(16).padStart(6, '0')
      : this.playerColorHex;
    const enemyColor = typeof this.enemyColorHex === 'number'
      ? '#' + this.enemyColorHex.toString(16).padStart(6, '0')
      : this.enemyColorHex;

    const tileSize = 128;

    for (let c = 0; c < UnitOverlay.UNIT_IDS.length; c++) {
      const uid = UnitOverlay.UNIT_IDS[c];

      // Satır 0: Oyuncu rozeti (y = 0..128)
      const pCx = c * tileSize + tileSize / 2;
      const pCy = 0 + tileSize / 2;
      UnitOverlay.drawBadge(ctx, pCx, pCy, 56, playerColor, uid);

      // Satır 1: Düşman rozeti (y = 128..256)
      const eCx = c * tileSize + tileSize / 2;
      const eCy = tileSize + tileSize / 2;
      UnitOverlay.drawBadge(ctx, eCx, eCy, 56, enemyColor, uid);

      // DOM için önbelleğe al
      this.cacheSingleBadgeUrl(atlas, c, 0, `${uid}_player`);
      this.cacheSingleBadgeUrl(atlas, c, 1, `${uid}_enemy`);
    }

    // S6: Taşıma göstergeleri (Sütun 8 = Altın sarısı kutu, Sütun 9 = Odun kütüğü)
    UnitOverlay.drawCarryIcon(ctx, 8 * tileSize + tileSize / 2, tileSize, 56, 'gold');
    UnitOverlay.drawCarryIcon(ctx, 9 * tileSize + tileSize / 2, tileSize, 56, 'wood');

    return atlas;
  }

  private static drawCarryIcon(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    type: 'gold' | 'wood'
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = type === 'gold' ? '#eab308' : '#78350f';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();

    if (type === 'gold') {
      ctx.fillStyle = '#fef08a';
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.rect(cx - 20, cy - 14, 40, 28);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.strokeStyle = '#b45309';
      ctx.stroke();
    } else {
      ctx.fillStyle = '#d97706';
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.rect(cx - 24, cy - 12, 48, 24);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(cx - 14, cy, 4, 9, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 14, cy, 4, 9, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private cacheSingleBadgeUrl(
    atlas: HTMLCanvasElement,
    col: number,
    row: number,
    key: string
  ): void {
    const sub = document.createElement('canvas');
    sub.width = 128;
    sub.height = 128;
    const sCtx = sub.getContext('2d');
    if (sCtx) {
      sCtx.drawImage(atlas, col * 128, row * 128, 128, 128, 0, 0, 128, 128);
      UnitOverlay.cachedDataUrls.set(key, sub.toDataURL('image/png'));
    }
  }

  // SPEC S2: 8 birim türünün simgelerinin canvas 2D çizimi
  private static drawBadge(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    bgColor: string,
    uid: UnitId
  ): void {
    ctx.save();

    // Takım renginde yuvarlak rozet
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = bgColor;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();

    // Beyaz simge stili
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (uid) {
      case 'tirendaz': {
        // S2 Tirendaz = Ok ve Yay
        ctx.beginPath();
        ctx.arc(cx - 10, cy, 26, -Math.PI / 2.5, Math.PI / 2.5);
        ctx.stroke();

        const topY = cy - 26 * Math.sin(Math.PI / 2.5);
        const topX = cx - 10 + 26 * Math.cos(Math.PI / 2.5);
        const botY = cy + 26 * Math.sin(Math.PI / 2.5);
        const botX = topX;
        ctx.beginPath();
        ctx.moveTo(topX, topY);
        ctx.lineTo(botX, botY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx - 16, cy);
        ctx.lineTo(cx + 22, cy);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx + 26, cy);
        ctx.lineTo(cx + 14, cy - 8);
        ctx.lineTo(cx + 14, cy + 8);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(cx - 10, cy - 6);
        ctx.lineTo(cx - 16, cy);
        ctx.lineTo(cx - 10, cy + 6);
        ctx.stroke();
        break;
      }

      case 'yenicheri': {
        // S2 Yeniçeri = Kalkan
        ctx.beginPath();
        ctx.moveTo(cx - 20, cy - 24);
        ctx.lineTo(cx + 20, cy - 24);
        ctx.lineTo(cx + 20, cy + 4);
        ctx.quadraticCurveTo(cx + 20, cy + 24, cx, cy + 28);
        ctx.quadraticCurveTo(cx - 20, cy + 24, cx - 20, cy + 4);
        ctx.closePath();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx, cy - 16);
        ctx.lineTo(cx, cy + 20);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx - 12, cy - 4);
        ctx.lineTo(cx + 12, cy - 4);
        ctx.stroke();
        break;
      }

      case 'deliler': {
        // S2 Deliler = At Başı / Mızrak
        // Süvari mızrağı ve flaması
        ctx.beginPath();
        ctx.moveTo(cx - 24, cy + 24);
        ctx.lineTo(cx + 22, cy - 22);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx + 28, cy - 28);
        ctx.lineTo(cx + 16, cy - 22);
        ctx.lineTo(cx + 22, cy - 16);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(cx + 10, cy - 10);
        ctx.lineTo(cx - 4, cy - 4);
        ctx.lineTo(cx + 6, cy + 2);
        ctx.closePath();
        ctx.fill();

        // At başı silüet çizgisi
        ctx.beginPath();
        ctx.moveTo(cx - 14, cy + 10);
        ctx.lineTo(cx - 10, cy - 8);
        ctx.lineTo(cx - 4, cy - 4);
        ctx.lineTo(cx, cy - 8);
        ctx.lineTo(cx + 8, cy - 2);
        ctx.lineTo(cx + 6, cy + 6);
        ctx.lineTo(cx - 2, cy + 6);
        ctx.stroke();
        break;
      }

      case 'zirhli_fil': {
        // S2 Zırhlı Fil = Fil
        ctx.beginPath();
        ctx.moveTo(cx - 20, cy + 16);
        ctx.quadraticCurveTo(cx - 20, cy - 16, cx - 4, cy - 18);
        ctx.quadraticCurveTo(cx + 12, cy - 18, cx + 16, cy - 6);
        ctx.quadraticCurveTo(cx + 20, cy + 8, cx + 24, cy + 14);
        ctx.quadraticCurveTo(cx + 30, cy + 20, cx + 32, cy + 12);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx + 10, cy + 6);
        ctx.quadraticCurveTo(cx + 20, cy + 8, cx + 24, cy - 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx - 6, cy - 12);
        ctx.quadraticCurveTo(cx - 18, cy - 6, cx - 14, cy + 10);
        ctx.quadraticCurveTo(cx - 10, cy + 16, cx, cy + 10);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx + 4, cy - 8, 2.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'sahi': {
        // S2 Şahi = Top
        ctx.save();
        ctx.translate(cx - 6, cy - 2);
        ctx.rotate(-Math.PI / 7);

        ctx.beginPath();
        ctx.moveTo(-18, -9);
        ctx.lineTo(18, -6);
        ctx.lineTo(20, -7);
        ctx.lineTo(20, 7);
        ctx.lineTo(18, 6);
        ctx.lineTo(-18, 9);
        ctx.closePath();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(-18, 0, 6, Math.PI / 2, -Math.PI / 2);
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(cx - 8, cy + 12, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx - 8, cy + 12, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx + 18, cy - 10, 5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'fetih_gemisi': {
        // S2 Fetih Gemisi = Gemi
        ctx.beginPath();
        ctx.moveTo(cx - 24, cy + 8);
        ctx.lineTo(cx - 14, cy + 18);
        ctx.lineTo(cx + 18, cy + 18);
        ctx.quadraticCurveTo(cx + 28, cy + 10, cx + 30, cy + 2);
        ctx.lineTo(cx + 16, cy + 6);
        ctx.closePath();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx - 26, cy + 22);
        ctx.quadraticCurveTo(cx - 14, cy + 26, cx - 2, cy + 22);
        ctx.quadraticCurveTo(cx + 10, cy + 18, cx + 22, cy + 22);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx - 2, cy - 20);
        ctx.lineTo(cx - 2, cy + 6);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx - 2, cy - 16);
        ctx.quadraticCurveTo(cx + 18, cy - 6, cx - 2, cy + 4);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(cx - 2, cy - 20);
        ctx.lineTo(cx + 10, cy - 17);
        ctx.lineTo(cx - 2, cy - 14);
        ctx.closePath();
        ctx.fill();
        break;
      }

      case 'altin_madencisi': {
        // S2 Altın Madencisi = Kazma
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-Math.PI / 4);

        ctx.beginPath();
        ctx.moveTo(0, -26);
        ctx.lineTo(0, 28);
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-28, -20);
        ctx.quadraticCurveTo(0, -28, 28, -20);
        ctx.quadraticCurveTo(0, -20, -28, -20);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(cx + 12, cy + 10, 5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'oduncu': {
        // S2 Oduncu = Balta
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-Math.PI / 4);

        ctx.beginPath();
        ctx.moveTo(0, -24);
        ctx.lineTo(0, 28);
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, -20);
        ctx.lineTo(20, -28);
        ctx.quadraticCurveTo(26, -14, 20, -4);
        ctx.lineTo(0, -10);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.rect(-8, -19, 8, 7);
        ctx.fill();
        ctx.restore();
        break;
      }
    }

    ctx.restore();
  }

  // Atlas UV koordinatlarını kullanarak badge InstancedMesh nesneleri oluşturur
  private initBadgeMeshes(): void {
    const teams: Team[] = ['player', 'enemy'];

    for (let c = 0; c < UnitOverlay.UNIT_IDS.length; c++) {
      const uid = UnitOverlay.UNIT_IDS[c];

      for (let r = 0; r < teams.length; r++) {
        const team = teams[r];
        const key = `${uid}_${team}`;

        const uMin = c / 10;
        const uMax = (c + 1) / 10;
        const vMax = r === 0 ? 1.0 : 0.5;
        const vMin = r === 0 ? 0.5 : 0.0;

        const geom = new THREE.PlaneGeometry(0.48, 0.48);
        const uvAttr = geom.attributes.uv;
        const uvArray = uvAttr.array as Float32Array;

        uvArray[0] = uMin; uvArray[1] = vMax;
        uvArray[2] = uMax; uvArray[3] = vMax;
        uvArray[4] = uMin; uvArray[5] = vMin;
        uvArray[6] = uMax; uvArray[7] = vMin;
        uvAttr.needsUpdate = true;

        this.badgeGeoms.push(geom);

        const mesh = new THREE.InstancedMesh(geom, this.atlasMaterial, this.MAX_INSTANCES);
        mesh.renderOrder = 1003;
        mesh.frustumCulled = false;
        mesh.count = 0;
        this.group.add(mesh);

        this.badgeMeshes.set(key, mesh);
      }
    }

    // S6: Taşıma rozeti meshleri (Altın = Col 8, Odun = Col 9)
    const carryConfigs: Array<{ key: string; col: number }> = [
      { key: 'carry_gold', col: 8 },
      { key: 'carry_wood', col: 9 },
    ];

    for (const cfg of carryConfigs) {
      const uMin = cfg.col / 10;
      const uMax = (cfg.col + 1) / 10;
      const vMin = 0.0;
      const vMax = 1.0;

      const geom = new THREE.PlaneGeometry(0.42, 0.42);
      const uvAttr = geom.attributes.uv;
      const uvArray = uvAttr.array as Float32Array;

      uvArray[0] = uMin; uvArray[1] = vMax;
      uvArray[2] = uMax; uvArray[3] = vMax;
      uvArray[4] = uMin; uvArray[5] = vMin;
      uvArray[6] = uMax; uvArray[7] = vMin;
      uvAttr.needsUpdate = true;

      this.badgeGeoms.push(geom);

      const mesh = new THREE.InstancedMesh(geom, this.atlasMaterial, this.MAX_INSTANCES);
      mesh.renderOrder = 1004;
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.group.add(mesh);

      this.badgeMeshes.set(cfg.key, mesh);
    }
  }

  // R11C M9: Model yükseklik tablosu UnitModels.modelHeight ile okunur
  private getUnitTopHeight(defId: UnitId): number {
    return UnitModels.modelHeight(defId);
  }

  // SPEC S1 & S3: Her karede konum ve doluluk güncellemesi
  public update(units: Unit[]): void {
    const cam = this.cameraController.getCamera();
    this.dummyQuat.copy(cam.quaternion);

    // Billboard ekran eksenleri
    this.screenUp.set(0, 1, 0).applyQuaternion(this.dummyQuat);
    this.screenRight.set(1, 0, 0).applyQuaternion(this.dummyQuat);

    // SPEC S1: Üç yakınlaştırma kademesinde de ekranda okunur boyutta kalır
    const zoomIdx = this.cameraController.getZoomLevelIndex();
    const baseScale = zoomIdx === 0 ? 0.85 : zoomIdx === 1 ? 1.05 : 1.35;

    let bgCount = 0;
    let greenCount = 0;
    let yellowCount = 0;
    let redCount = 0;

    const badgeCounts: Map<string, number> = new Map();
    for (const key of this.badgeMeshes.keys()) {
      badgeCounts.set(key, 0);
    }

    for (const unit of units) {
      // SPEC S3: Ölü birimin göstergesi hemen kalkar
      if (unit.state === 'dead' || unit.hp <= 0) continue;

      // SPEC S3: Yalnızca FogOfWar.canPlayerSee(unit) true olanların göstergesi çizilir
      if (this.fogOfWar && !this.fogOfWar.canPlayerSee(unit)) continue;

      const def = UNITS[unit.defId];
      const isWorker = def?.tags.includes('worker');

      // SPEC S1: Askerlerde her zaman görünür; işçilerde yalnızca hasar almışsa görünür [EK]
      const showBar = !isWorker || unit.hp < unit.maxHp;

      const topY = this.getUnitTopHeight(unit.defId);
      // Baş üstü merkezi konumu
      this.tempVec.set(unit.pos.x, topY + 0.15, unit.pos.y);

      let barCenter = this.tempVec;

      if (showBar) {
        barCenter = this.tempVec.clone().addScaledVector(this.screenUp, 0.12 * baseScale);

        // Koyu arka plan
        if (bgCount < this.MAX_INSTANCES) {
          this.dummyPos.copy(barCenter);
          this.dummyScale.set(baseScale, baseScale, 1);
          this.dummyMatrix.compose(this.dummyPos, this.dummyQuat, this.dummyScale);
          this.barBgMesh.setMatrixAt(bgCount++, this.dummyMatrix);
        }

        // Dolu oranı
        const ratio = Math.max(0, Math.min(1, unit.hp / unit.maxHp));

        // Sol kenara yaslı iç dolgu pozisyonu
        const fillLeft = barCenter.clone().addScaledVector(this.screenRight, -0.40 * baseScale);
        this.dummyPos.copy(fillLeft);
        this.dummyScale.set(ratio * baseScale, baseScale, 1);
        this.dummyMatrix.compose(this.dummyPos, this.dummyQuat, this.dummyScale);

        // SPEC S1: Renk eşikleri (> %60 yeşil, %30-%60 sarı, < %30 kırmızı)
        if (ratio > 0.60) {
          if (greenCount < this.MAX_INSTANCES) {
            this.barFillGreenMesh.setMatrixAt(greenCount++, this.dummyMatrix);
          }
        } else if (ratio >= 0.30) {
          if (yellowCount < this.MAX_INSTANCES) {
            this.barFillYellowMesh.setMatrixAt(yellowCount++, this.dummyMatrix);
          }
        } else {
          if (redCount < this.MAX_INSTANCES) {
            this.barFillRedMesh.setMatrixAt(redCount++, this.dummyMatrix);
          }
        }
      }

      // SPEC S2: Tür simgesi rozeti (çubuğun üstünde veya çubuk yoksa doğrudan baş üstünde)
      const badgeKey = `${unit.defId}_${unit.team}`;
      const badgeMesh = this.badgeMeshes.get(badgeKey);
      if (badgeMesh) {
        const bIdx = badgeCounts.get(badgeKey) || 0;
        if (bIdx < this.MAX_INSTANCES) {
          const badgeOffset = showBar ? 0.30 * baseScale : 0.22 * baseScale;
          const badgePos = barCenter.clone().addScaledVector(this.screenUp, badgeOffset);

          this.dummyPos.copy(badgePos);
          this.dummyScale.set(baseScale, baseScale, 1);
          this.dummyMatrix.compose(this.dummyPos, this.dummyQuat, this.dummyScale);
          badgeMesh.setMatrixAt(bIdx, this.dummyMatrix);

          badgeCounts.set(badgeKey, bIdx + 1);
        }
      }

      // SPEC S6: Yük taşıyan işçinin üstünde taşıdığı kaynak simgesi rozeti (Altın = Sarı kutu, Odun = Kütük)
      if (unit.carriedAmount > 0 && unit.carriedType) {
        const carryKey = unit.carriedType === 'gold' ? 'carry_gold' : 'carry_wood';
        const carryMesh = this.badgeMeshes.get(carryKey);
        if (carryMesh) {
          const cIdx = badgeCounts.get(carryKey) || 0;
          if (cIdx < this.MAX_INSTANCES) {
            const carryOffset = showBar ? 0.54 * baseScale : 0.44 * baseScale;
            const carryPos = barCenter.clone().addScaledVector(this.screenUp, carryOffset);

            this.dummyPos.copy(carryPos);
            this.dummyScale.set(baseScale * 0.85, baseScale * 0.85, 1);
            this.dummyMatrix.compose(this.dummyPos, this.dummyQuat, this.dummyScale);
            carryMesh.setMatrixAt(cIdx, this.dummyMatrix);

            badgeCounts.set(carryKey, cIdx + 1);
          }
        }
      }
    }

    // Sayaçları ve matris güncellemelerini işle
    this.barBgMesh.count = bgCount;
    this.barBgMesh.instanceMatrix.needsUpdate = true;

    this.barFillGreenMesh.count = greenCount;
    this.barFillGreenMesh.instanceMatrix.needsUpdate = true;

    this.barFillYellowMesh.count = yellowCount;
    this.barFillYellowMesh.instanceMatrix.needsUpdate = true;

    this.barFillRedMesh.count = redCount;
    this.barFillRedMesh.instanceMatrix.needsUpdate = true;

    for (const [key, count] of badgeCounts.entries()) {
      const mesh = this.badgeMeshes.get(key);
      if (mesh) {
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  public getGroup(): THREE.Group {
    return this.group;
  }

  public destroy(): void {
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
    this.group.clear();

    this.bgGeom.dispose();
    this.fillGeom.dispose();
    for (const g of this.badgeGeoms) {
      g.dispose();
    }
    for (const m of this.materials) {
      m.dispose();
    }
    this.atlasTexture.dispose();
    this.badgeMeshes.clear();
  }
}
