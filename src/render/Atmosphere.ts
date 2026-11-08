import * as THREE from 'three';
import { PALETTE, getPaletteCss } from './Palette';

export type QualityProfile = 'yuksek' | 'dusuk';

export class Atmosphere {
  private qualityProfile: QualityProfile;
  private readonly isTouchOrNarrow: boolean;
  private qualityListeners: Set<(profile: QualityProfile) => void> = new Set();

  // Işıklar
  private hemiLight: THREE.HemisphereLight;
  private sunLight: THREE.DirectionalLight;

  // Sis ve gökyüzü
  private fog: THREE.Fog;
  private bgTexture: THREE.CanvasTexture;

  // Sahte gölge (Blob shadow) InstancedMesh'leri
  private shadowTexture: THREE.CanvasTexture;
  private shadowMaterial: THREE.MeshBasicMaterial;
  private shadowGeometry: THREE.BufferGeometry;
  private unitShadowMesh: THREE.InstancedMesh;
  private buildingShadowMesh: THREE.InstancedMesh;
  private readonly MAX_UNIT_SHADOWS = 300;
  private readonly MAX_BUILDING_SHADOWS = 80;

  // Çöp toplayıcı yükünü önleyen matris yardımcıları
  private dummyMatrix = new THREE.Matrix4();
  private dummyPos = new THREE.Vector3();
  private dummyQuat = new THREE.Quaternion();
  private dummyScale = new THREE.Vector3(1, 1, 1);
  private dummyEuler = new THREE.Euler(-Math.PI / 2, 0, 0);

  // Performans takibi (son 3 saniyenin ortalama kare süresi)
  private frameTimestamps: number[] = [];
  private frameDurations: number[] = [];
  private lastFrameTime: number = 0;

  constructor(
    private scene: THREE.Scene,
    private renderer: THREE.WebGLRenderer
  ) {
    // S4b: Başlangıç profili
    const isTouch =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || (navigator && navigator.maxTouchPoints > 0));
    const isNarrow = typeof window !== 'undefined' && window.innerWidth < 768;
    this.isTouchOrNarrow = isTouch || isNarrow;
    this.qualityProfile = this.isTouchOrNarrow ? 'dusuk' : 'yuksek';

    // 1. Gökyüzü arka planı (canvas yumuşak gradient: ufukta açık, tepede mavi)
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = 32;
    bgCanvas.height = 512;
    const bgCtx = bgCanvas.getContext('2d')!;
    const bgGrad = bgCtx.createLinearGradient(0, 0, 0, 512);
    bgGrad.addColorStop(0, getPaletteCss('skyZenith')); // #60a5fa
    bgGrad.addColorStop(0.65, '#a0c7fc');
    bgGrad.addColorStop(1, getPaletteCss('skyHorizon')); // #cfe4ff
    bgCtx.fillStyle = bgGrad;
    bgCtx.fillRect(0, 0, 32, 512);

    this.bgTexture = new THREE.CanvasTexture(bgCanvas);
    this.scene.background = this.bgTexture;

    // 2. S2: THREE.Fog mesafeleri (başlangıç orta kademe)
    this.fog = new THREE.Fog(PALETTE.fog, 76, 150);
    this.scene.fog = this.fog;

    // 3. S3: Işıklar
    // Hemisphere: gökyüzü açık mavi, zemin sıcak toprak tonu
    this.hemiLight = new THREE.HemisphereLight(
      PALETTE.hemiSky,
      PALETTE.hemiGround,
      0.85
    );
    this.hemiLight.name = 'AtmosphereHemiLight';
    this.scene.add(this.hemiLight);

    // DirectionalLight: sıcak tonlu güneş, sabit hafif yandan açı
    this.sunLight = new THREE.DirectionalLight(PALETTE.sunLight, 1.35);
    this.sunLight.name = 'AtmosphereSunLight';
    this.sunLight.position.set(45, 80, 40);
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // 4. S4: Sahte gölge (radial gradient canvas texture)
    const sCanvas = document.createElement('canvas');
    sCanvas.width = 128;
    sCanvas.height = 128;
    const sCtx = sCanvas.getContext('2d')!;
    const radGrad = sCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
    radGrad.addColorStop(0, 'rgba(15, 23, 42, 0.46)');
    radGrad.addColorStop(0.5, 'rgba(15, 23, 42, 0.28)');
    radGrad.addColorStop(0.85, 'rgba(15, 23, 42, 0.08)');
    radGrad.addColorStop(1.0, 'rgba(15, 23, 42, 0)');
    sCtx.fillStyle = radGrad;
    sCtx.fillRect(0, 0, 128, 128);

    this.shadowTexture = new THREE.CanvasTexture(sCanvas);
    this.shadowMaterial = new THREE.MeshBasicMaterial({
      map: this.shadowTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
    });

    // Zemin üzerinde yatay düzlem (XZ)
    this.shadowGeometry = new THREE.PlaneGeometry(1, 1);
    this.shadowGeometry.rotateX(-Math.PI / 2);

    this.unitShadowMesh = new THREE.InstancedMesh(
      this.shadowGeometry,
      this.shadowMaterial,
      this.MAX_UNIT_SHADOWS
    );
    this.unitShadowMesh.name = 'UnitBlobShadowMesh';
    this.unitShadowMesh.renderOrder = 2; // Zemin (0) üstünde, halka (999) altında
    this.unitShadowMesh.frustumCulled = false;
    this.unitShadowMesh.count = 0;
    this.scene.add(this.unitShadowMesh);

    this.buildingShadowMesh = new THREE.InstancedMesh(
      this.shadowGeometry,
      this.shadowMaterial,
      this.MAX_BUILDING_SHADOWS
    );
    this.buildingShadowMesh.name = 'BuildingBlobShadowMesh';
    this.buildingShadowMesh.renderOrder = 2;
    this.buildingShadowMesh.frustumCulled = false;
    this.buildingShadowMesh.count = 0;
    this.scene.add(this.buildingShadowMesh);

    // Profil ayarlarını uygula
    this.applyProfileConfig();
  }

  private applyProfileConfig(): void {
    if (this.qualityProfile === 'yuksek' && !this.isTouchOrNarrow) {
      // Masaüstü yüksek profil: gerçek yönlü gölge aktif
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.width = 2048;
      this.sunLight.shadow.mapSize.height = 2048;
      this.sunLight.shadow.camera.near = 10;
      this.sunLight.shadow.camera.far = 250;
      this.sunLight.shadow.camera.left = -40;
      this.sunLight.shadow.camera.right = 40;
      this.sunLight.shadow.camera.top = 40;
      this.sunLight.shadow.camera.bottom = -40;
      this.sunLight.shadow.bias = -0.0006;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    } else {
      // Düşük profil: gerçek gölge kapalı, piksel oranı en çok 1.5
      this.renderer.shadowMap.enabled = false;
      this.sunLight.castShadow = false;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    }
  }

  public getQualityProfile(): QualityProfile {
    return this.qualityProfile;
  }

  public onQualityChanged(callback: (profile: QualityProfile) => void): () => void {
    this.qualityListeners.add(callback);
    return () => this.qualityListeners.delete(callback);
  }

  private setQualityProfile(newProfile: QualityProfile): void {
    if (this.qualityProfile === newProfile) return;
    this.qualityProfile = newProfile;
    this.applyProfileConfig();
    for (const listener of this.qualityListeners) {
      listener(newProfile);
    }
  }

  // S4b: Performans takibi (son 3 saniyede ortalama > 28 ms ise düşüğe düşür)
  private trackPerformance(): void {
    const now = performance.now();
    if (this.lastFrameTime > 0) {
      const deltaMs = now - this.lastFrameTime;
      this.frameTimestamps.push(now);
      this.frameDurations.push(deltaMs);

      const cutoff = now - 3000;
      while (this.frameTimestamps.length > 0 && this.frameTimestamps[0] < cutoff) {
        this.frameTimestamps.shift();
        this.frameDurations.shift();
      }

      // En az 1.5 saniyelik veri toplandıktan sonra değerlendir
      if (this.frameDurations.length > 30 && now - this.frameTimestamps[0] >= 1500) {
        let total = 0;
        for (const d of this.frameDurations) total += d;
        const avgDelta = total / this.frameDurations.length;

        if (avgDelta > 28 && this.qualityProfile === 'yuksek') {
          this.setQualityProfile('dusuk');
        }
      }
    }
    this.lastFrameTime = now;
  }

  // Her render karesinde çağrılır
  public update(camera: THREE.Camera): void {
    this.trackPerformance();

    // S2: Sis mesafelerini kamera yakınlaştırma kademesine göre ayarla
    if (camera instanceof THREE.OrthographicCamera) {
      const frustumHeight = Math.abs(camera.top - camera.bottom);
      if (frustumHeight <= 20) {
        // Kademe 0 (Yakın: 18)
        this.fog.near = 88;
        this.fog.far = 135;
      } else if (frustumHeight <= 32) {
        // Kademe 1 (Orta/Varsayılan: 28)
        this.fog.near = 76;
        this.fog.far = 150;
      } else {
        // Kademe 2 (Uzak: 42)
        this.fog.near = 64;
        this.fog.far = 175;
      }

      // Güneş ışığı hedefini kameranın baktığı yere odakla
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const dist = 100;
      const targetPos = camera.position.clone().addScaledVector(forward, dist);
      this.sunLight.target.position.set(targetPos.x, 0, targetPos.z);
      this.sunLight.position.set(targetPos.x + 45, 80, targetPos.z + 40);
      this.sunLight.target.updateMatrixWorld();
    }

    // S4: Sahnedeki birim ve binaların altına sahte gölgeleri yerleştir
    this.updateBlobShadows();
  }

  private updateBlobShadows(): void {
    let unitCount = 0;
    let buildingCount = 0;

    const tempMat = new THREE.Matrix4();
    const tempPos = new THREE.Vector3();
    const tempQuat = new THREE.Quaternion();
    const tempScale = new THREE.Vector3();

    this.dummyQuat.setFromEuler(this.dummyEuler);

    for (const child of this.scene.children) {
      if (!child.visible) continue;

      // 1. Birimlerin tespiti (UnitManager grubundaki instanced diskler veya meshler)
      if (child instanceof THREE.Group && child.children.length > 0) {
        // UnitManager grubu kontrolü
        const playerDisk = child.children.find(
          (c) => c instanceof THREE.InstancedMesh && c.name !== 'UnitBlobShadowMesh' && (c as THREE.InstancedMesh).count > 0 && c.renderOrder === 999
        ) as THREE.InstancedMesh | undefined;

        if (playerDisk) {
          for (const diskChild of child.children) {
            if (diskChild instanceof THREE.InstancedMesh && diskChild.renderOrder === 999) {
              const count = diskChild.count;
              for (let i = 0; i < count && unitCount < this.MAX_UNIT_SHADOWS; i++) {
                diskChild.getMatrixAt(i, tempMat);
                tempMat.decompose(tempPos, tempQuat, tempScale);

                // y = 0.015 konumu
                this.dummyPos.set(tempPos.x, 0.015, tempPos.z);
                const s = Math.max(0.6, tempScale.x * 1.35);
                this.dummyScale.set(s, s, 1);
                this.dummyMatrix.compose(this.dummyPos, this.dummyQuat, this.dummyScale);
                this.unitShadowMesh.setMatrixAt(unitCount++, this.dummyMatrix);
              }
            }
          }
        }

        // 2. Binaların tespiti (BuildingManager grubu: binalar alt gruplar olarak saklanır)
        const isBuildingGroup = child.children.some(
          (c) => c instanceof THREE.Group && c.children.length > 0 && !c.name.includes('Unit')
        );

        if (isBuildingGroup) {
          for (const bGroup of child.children) {
            if (bGroup instanceof THREE.Group && bGroup.visible && bGroup.children.length > 0) {
              if (buildingCount < this.MAX_BUILDING_SHADOWS) {
                // Binanın merkez konumu
                this.dummyPos.set(bGroup.position.x, 0.012, bGroup.position.z);

                // Binaların ayak izine göre gölge yarıçapı
                let radius = 3.6;
                const childCount = bGroup.children.length;
                if (childCount >= 4) {
                  // Büyük bina / HQ (6x6)
                  radius = 5.6;
                } else if (childCount >= 2) {
                  // Kışla / Tersane (4x4, 5x5)
                  radius = 4.2;
                }

                this.dummyScale.set(radius, radius, 1);
                this.dummyMatrix.compose(this.dummyPos, this.dummyQuat, this.dummyScale);
                this.buildingShadowMesh.setMatrixAt(buildingCount++, this.dummyMatrix);
              }
            }
          }
        }
      }
    }

    this.unitShadowMesh.count = unitCount;
    this.unitShadowMesh.instanceMatrix.needsUpdate = true;

    this.buildingShadowMesh.count = buildingCount;
    this.buildingShadowMesh.instanceMatrix.needsUpdate = true;
  }

  public destroy(): void {
    this.scene.remove(this.hemiLight);
    this.scene.remove(this.sunLight);
    this.scene.remove(this.sunLight.target);
    this.scene.remove(this.unitShadowMesh);
    this.scene.remove(this.buildingShadowMesh);

    this.hemiLight.dispose();
    this.sunLight.dispose();

    this.bgTexture.dispose();
    this.shadowTexture.dispose();
    this.shadowMaterial.dispose();
    this.shadowGeometry.dispose();
    this.unitShadowMesh.dispose();
    this.buildingShadowMesh.dispose();

    this.qualityListeners.clear();
  }
}
