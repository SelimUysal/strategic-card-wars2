import * as THREE from 'three';
import { MATCH_RULES } from '../data/matchRules';

export class CameraController {
  private camera: THREE.OrthographicCamera;
  private target: THREE.Vector3 = new THREE.Vector3(0, 0, 0);

  // SPEC S1: Sürükleme modu sabiti ('grab' varsayılan, 'follow' alternatif) [EK]
  public dragMode: 'grab' | 'follow' = 'grab';

  // TASARIM KARARI: 3 yakınlaştırma kademesi (frustum dikey boyutu)
  // Kademe 0 (Yakın): 18, Kademe 1 (Orta/Varsayılan): 28, Kademe 2 (Uzak): 42
  private zoomLevels: number[] = [18, 28, 42];
  private currentZoomIndex: number = 1;

  // TASARIM KARARI: Klasik izometrik açılar
  // Yatay açı: 45° (Math.PI / 4), Dikey eğim açısı: arctan(1 / sqrt(2)) ~ 35.264°
  private readonly cameraDistance: number = 100;
  private readonly elevationAngle: number = Math.atan(Math.SQRT1_2);
  private readonly azimuthAngle: number = Math.PI / 4;

  private mapWidth: number = 100;
  private mapHeight: number = 100;
  private inputEnabled: boolean = true;

  private viewportWidth: number = 1;
  private viewportHeight: number = 1;

  // SPEC S1 & S3: Pointer ve sürükleme durumu
  private activePointers: Map<number, { x: number; y: number }> = new Map();
  private pointerStartPositions: Map<number, { x: number; y: number }> = new Map();
  private initialPinchDistance: number | null = null;
  private isDragging: boolean = false;
  private lastDragPosition: { x: number; y: number } = { x: 0, y: 0 };

  // SPEC S1: Yere izdüşüm için Three.js nesneleri
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly raycaster = new THREE.Raycaster();
  private readonly tempVec2 = new THREE.Vector2();
  private readonly p0 = new THREE.Vector3();
  private readonly p1 = new THREE.Vector3();
  private readonly delta = new THREE.Vector3();

  // SPEC S2: Klavye takibi (W A S D ve Ok Tuşları)
  private keysPressed: {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
  } = {
    up: false,
    down: false,
    left: false,
    right: false,
  };

  // Dinleyici referansları (temizleme için)
  private onPointerDownBound: (e: PointerEvent) => void;
  private onPointerMoveBound: (e: PointerEvent) => void;
  private onPointerUpBound: (e: PointerEvent) => void;
  private onWheelBound: (e: WheelEvent) => void;
  private onKeyDownBound: (e: KeyboardEvent) => void;
  private onKeyUpBound: (e: KeyboardEvent) => void;

  constructor(private canvas: HTMLCanvasElement) {
    // SPEC S5: near = -200, far = 1000 ile en yakın kademede hiçbir model kesilmez
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 1000);

    // Bağlama işlemleri
    this.onPointerDownBound = this.onPointerDown.bind(this);
    this.onPointerMoveBound = this.onPointerMove.bind(this);
    this.onPointerUpBound = this.onPointerUp.bind(this);
    this.onWheelBound = this.onWheel.bind(this);
    this.onKeyDownBound = this.onKeyDown.bind(this);
    this.onKeyUpBound = this.onKeyUp.bind(this);

    // Olay dinleyicileri YALNIZCA canvas üzerinde başlar
    this.canvas.addEventListener('pointerdown', this.onPointerDownBound);
    window.addEventListener('pointermove', this.onPointerMoveBound);
    window.addEventListener('pointerup', this.onPointerUpBound);
    window.addEventListener('pointercancel', this.onPointerUpBound);
    this.canvas.addEventListener('wheel', this.onWheelBound, { passive: false });

    // Klavye dinleyicileri
    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);

    this.updateCameraTransform();
  }

  public setBounds(width: number, height: number): void {
    this.mapWidth = width;
    this.mapHeight = height;
    this.clampTargetToBounds();
    this.updateCameraTransform();
  }

  public focusOn(x: number, y: number): void {
    this.target.set(x, 0, y);
    this.clampTargetToBounds();
    this.updateCameraTransform();
  }

  public setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
    if (!enabled) {
      this.activePointers.clear();
      this.pointerStartPositions.clear();
      this.isDragging = false;
      this.keysPressed.up = false;
      this.keysPressed.down = false;
      this.keysPressed.left = false;
      this.keysPressed.right = false;
    }
  }

  public resize(width: number, height: number): void {
    this.viewportWidth = Math.max(1, width);
    this.viewportHeight = Math.max(1, height);
    this.updateProjection();
  }

  // SPEC S2: W A S D ve Ok tuşları EKRAN yönüne göre çalışır; çapraz hızlar normalize
  public update(realDt: number): void {
    if (!this.inputEnabled) return;

    let screenDx = 0; // Ekranda sol (-1) / sağ (+1)
    let screenDy = 0; // Ekranda aşağı (-1) / yukarı (+1)

    if (this.keysPressed.up) screenDy += 1;
    if (this.keysPressed.down) screenDy -= 1;
    if (this.keysPressed.left) screenDx -= 1;
    if (this.keysPressed.right) screenDx += 1;

    if (screenDx !== 0 || screenDy !== 0) {
      const len = Math.hypot(screenDx, screenDy);
      const normX = screenDx / len;
      const normY = screenDy / len;

      const panSpeed = 30 * realDt;

      const cosA = Math.cos(this.azimuthAngle);
      const sinA = Math.sin(this.azimuthAngle);

      // Ekranda sağa hareket (+normX): dünya izometrik zemininde (+sinA, 0, -cosA)
      // Ekranda yukarı hareket (+normY): dünya izometrik zemininde (-cosA, 0, -sinA)
      const worldDx = (sinA * normX - cosA * normY) * panSpeed;
      const worldDz = (-cosA * normX - sinA * normY) * panSpeed;

      this.target.x += worldDx;
      this.target.z += worldDz;
      this.clampTargetToBounds();
      this.updateCameraTransform();
    }
  }

  // Ekran koordinatını (piksel) y=0 zemin düzlemine izdüşürür
  private getGroundPoint(screenX: number, screenY: number, out: THREE.Vector3): boolean {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    this.tempVec2.x = ((screenX - rect.left) / rect.width) * 2 - 1;
    this.tempVec2.y = -(((screenY - rect.top) / rect.height) * 2 - 1);

    this.raycaster.setFromCamera(this.tempVec2, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, out);
    return hit !== null;
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.inputEnabled) return;

    // SPEC S6: Kart paneli, minimap veya üst çubuk üzerindeki fare etkileşimleri kamerayı sürüklemez
    if (e.target !== this.canvas) return;

    // Fare ise yalnızca sol tık (button === 0)
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    // SPEC S3: Sürükleme için pointer capture kullanılır
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch (_) {
      // Tarayıcı kısıtı durumunda sessizce devam et
    }

    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.pointerStartPositions.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.activePointers.size === 1) {
      // SPEC S3: 6 pikselden az hareket eden tıklamalar sürükleme sayılmaz (henüz sürükleme başlatılmaz)
      this.isDragging = false;
      this.lastDragPosition = { x: e.clientX, y: e.clientY };
    } else if (this.activePointers.size === 2) {
      // Dokunmatik iki parmak kıstırma
      this.isDragging = false;
      const points = Array.from(this.activePointers.values());
      this.initialPinchDistance = Math.hypot(
        points[0].x - points[1].x,
        points[0].y - points[1].y
      );
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.inputEnabled || !this.activePointers.has(e.pointerId)) return;

    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Tek parmak / fare ile sürükleme
    if (this.activePointers.size === 1) {
      const startPos = this.pointerStartPositions.get(e.pointerId);
      if (startPos) {
        const totalDistance = Math.hypot(e.clientX - startPos.x, e.clientY - startPos.y);
        // SPEC S3: 6 pikselden az hareket eden tıklamalar sürükleme sayılmaz
        if (!this.isDragging && totalDistance >= 6) {
          this.isDragging = true;
          this.lastDragPosition = { x: e.clientX, y: e.clientY };
        }
      }

      if (this.isDragging) {
        // SPEC S1: Ekran farkını kameranın yere izdüşümü üzerinden dünya koordinatına çevir
        const hasP0 = this.getGroundPoint(this.lastDragPosition.x, this.lastDragPosition.y, this.p0);
        const hasP1 = this.getGroundPoint(e.clientX, e.clientY, this.p1);
        this.lastDragPosition = { x: e.clientX, y: e.clientY };

        if (hasP0 && hasP1) {
          this.delta.subVectors(this.p1, this.p0);

          if (this.dragMode === 'grab') {
            // 'grab' mantığı: basılı tutulan zemin noktası imlecin altında kalır (harita imleçle gider)
            this.target.sub(this.delta);
          } else {
            // 'follow' mantığı: kamera imlecin gittiği yönde ilerler
            this.target.add(this.delta);
          }

          this.clampTargetToBounds();
          this.updateCameraTransform();
        }
      }
    } else if (this.activePointers.size === 2 && this.initialPinchDistance !== null) {
      // SPEC S3: İki parmakla kıstırma (pinch zoom)
      const points = Array.from(this.activePointers.values());
      const currentDistance = Math.hypot(
        points[0].x - points[1].x,
        points[0].y - points[1].y
      );

      const pinchDelta = currentDistance - this.initialPinchDistance;
      const pinchThreshold = 35;

      if (pinchDelta > pinchThreshold) {
        // Yakınlaş (zoom in: 42 -> 28 -> 18)
        this.stepZoom(-1);
        this.initialPinchDistance = currentDistance;
      } else if (pinchDelta < -pinchThreshold) {
        // Uzaklaş (zoom out: 18 -> 28 -> 42)
        this.stepZoom(1);
        this.initialPinchDistance = currentDistance;
      }
    }
  }

  private onPointerUp(e: PointerEvent): void {
    // SPEC S3: Pointer capture bırakılır
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch (_) {
      // Tarayıcı kısıtı durumunda sessizce devam et
    }

    this.activePointers.delete(e.pointerId);
    this.pointerStartPositions.delete(e.pointerId);

    if (this.activePointers.size === 0) {
      this.isDragging = false;
      this.initialPinchDistance = null;
    } else if (this.activePointers.size === 1) {
      const remaining = Array.from(this.activePointers.values())[0];
      const remainingId = Array.from(this.activePointers.keys())[0];
      this.lastDragPosition = { x: remaining.x, y: remaining.y };
      this.pointerStartPositions.set(remainingId, { x: remaining.x, y: remaining.y });
      this.isDragging = false;
      this.initialPinchDistance = null;
    }
  }

  private onWheel(e: WheelEvent): void {
    if (!this.inputEnabled) return;
    e.preventDefault();

    if (e.deltaY > 0) {
      // Uzaklaş (zoom out)
      this.stepZoom(1);
    } else if (e.deltaY < 0) {
      // Yakınlaş (zoom in)
      this.stepZoom(-1);
    }
  }

  private stepZoom(direction: number): void {
    const maxIndex = MATCH_RULES.cameraZoomLevelCount - 1;
    const newIndex = THREE.MathUtils.clamp(
      this.currentZoomIndex + direction,
      0,
      maxIndex
    );

    if (newIndex !== this.currentZoomIndex) {
      this.currentZoomIndex = newIndex;
      this.updateProjection();
    }
  }

  // SPEC S2: W A S D ve Ok Tuşları
  private onKeyDown(e: KeyboardEvent): void {
    if (!this.inputEnabled) return;
    const key = e.key.toLowerCase();
    if (key === 'w' || key === 'arrowup') this.keysPressed.up = true;
    if (key === 's' || key === 'arrowdown') this.keysPressed.down = true;
    if (key === 'a' || key === 'arrowleft') this.keysPressed.left = true;
    if (key === 'd' || key === 'arrowright') this.keysPressed.right = true;
  }

  private onKeyUp(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    if (key === 'w' || key === 'arrowup') this.keysPressed.up = false;
    if (key === 's' || key === 'arrowdown') this.keysPressed.down = false;
    if (key === 'a' || key === 'arrowleft') this.keysPressed.left = false;
    if (key === 'd' || key === 'arrowright') this.keysPressed.right = false;
  }

  // SPEC S4: Haritanın tüm kenarları ve köşeleri görüş alanına gelecek şekilde yumuşak pay bırakılır [EK]
  private clampTargetToBounds(): void {
    const margin = 6;
    this.target.x = THREE.MathUtils.clamp(this.target.x, -margin, this.mapWidth + margin);
    this.target.z = THREE.MathUtils.clamp(this.target.z, -margin, this.mapHeight + margin);
  }

  private updateProjection(): void {
    const aspect = this.viewportWidth / this.viewportHeight;
    const halfHeight = this.zoomLevels[this.currentZoomIndex];
    const halfWidth = halfHeight * aspect;

    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    // SPEC S5: near/far düzlemleri en yakın kademede hiçbir modeli kesmeyecek aralıkta
    this.camera.near = -200;
    this.camera.far = 1000;
    this.camera.updateProjectionMatrix();
  }

  private updateCameraTransform(): void {
    // Kamera ofseti (İzometrik pozisyon)
    const offsetX = this.cameraDistance * Math.cos(this.azimuthAngle) * Math.cos(this.elevationAngle);
    const offsetY = this.cameraDistance * Math.sin(this.elevationAngle);
    const offsetZ = this.cameraDistance * Math.sin(this.azimuthAngle) * Math.cos(this.elevationAngle);

    this.camera.position.set(
      this.target.x + offsetX,
      this.target.y + offsetY,
      this.target.z + offsetZ
    );
    this.camera.lookAt(this.target);
  }

  public getCamera(): THREE.OrthographicCamera {
    return this.camera;
  }

  public getTarget(): THREE.Vector3 {
    return this.target.clone();
  }

  public getZoomLevelIndex(): number {
    return this.currentZoomIndex;
  }

  // SPEC S3: Görüş alanı köşe koordinatlarını yere izdüşüm olarak okuma fonksiyonu
  public getViewportGroundCorners(): Array<{ x: number; y: number }> {
    const corners: Array<{ x: number; y: number }> = [];
    const ndcCoords = [
      new THREE.Vector3(-1, 1, 0),
      new THREE.Vector3(1, 1, 0),
      new THREE.Vector3(1, -1, 0),
      new THREE.Vector3(-1, -1, 0),
    ];

    for (const ndc of ndcCoords) {
      const v = ndc.clone().unproject(this.camera);
      const ray = new THREE.Ray(this.camera.position, v.clone().sub(this.camera.position).normalize());
      const target = new THREE.Vector3();
      const hit = ray.intersectPlane(this.groundPlane, target);
      if (hit) {
        corners.push({ x: target.x, y: target.z });
      } else {
        corners.push({ x: this.target.x, y: this.target.z });
      }
    }
    return corners;
  }

  public destroy(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDownBound);
    window.removeEventListener('pointermove', this.onPointerMoveBound);
    window.removeEventListener('pointerup', this.onPointerUpBound);
    window.removeEventListener('pointercancel', this.onPointerUpBound);
    this.canvas.removeEventListener('wheel', this.onWheelBound);
    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('keyup', this.onKeyUpBound);
  }
}
