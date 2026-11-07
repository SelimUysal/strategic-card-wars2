import * as THREE from 'three';
import { MATCH_RULES } from '../data/matchRules';

export class CameraController {
  private camera: THREE.OrthographicCamera;
  private target: THREE.Vector3 = new THREE.Vector3(0, 0, 0);

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

  // Pointer takibi (dokunmatik ve fare)
  private activePointers: Map<number, { x: number; y: number }> = new Map();
  private initialPinchDistance: number | null = null;
  private isDragging: boolean = false;
  private lastDragPosition: { x: number; y: number } = { x: 0, y: 0 };

  // Klavye takibi (W A S D)
  private keysPressed: { w: boolean; a: boolean; s: boolean; d: boolean } = {
    w: false,
    a: false,
    s: false,
    d: false,
  };

  // Dinleyici referansları (temizleme için)
  private onPointerDownBound: (e: PointerEvent) => void;
  private onPointerMoveBound: (e: PointerEvent) => void;
  private onPointerUpBound: (e: PointerEvent) => void;
  private onWheelBound: (e: WheelEvent) => void;
  private onKeyDownBound: (e: KeyboardEvent) => void;
  private onKeyUpBound: (e: KeyboardEvent) => void;

  constructor(private canvas: HTMLCanvasElement) {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);

    // Bağlama işlemleri
    this.onPointerDownBound = this.onPointerDown.bind(this);
    this.onPointerMoveBound = this.onPointerMove.bind(this);
    this.onPointerUpBound = this.onPointerUp.bind(this);
    this.onWheelBound = this.onWheel.bind(this);
    this.onKeyDownBound = this.onKeyDown.bind(this);
    this.onKeyUpBound = this.onKeyUp.bind(this);

    // Olay dinleyicileri YALNIZCA canvas üzerinde
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
      this.isDragging = false;
      this.keysPressed.w = false;
      this.keysPressed.a = false;
      this.keysPressed.s = false;
      this.keysPressed.d = false;
    }
  }

  public resize(width: number, height: number): void {
    this.viewportWidth = Math.max(1, width);
    this.viewportHeight = Math.max(1, height);
    this.updateProjection();
  }

  public update(realDt: number): void {
    if (!this.inputEnabled) return;

    // W A S D klavye ile kaydırma
    let moveForward = 0;
    let moveRight = 0;

    if (this.keysPressed.w) moveForward -= 1;
    if (this.keysPressed.s) moveForward += 1;
    if (this.keysPressed.a) moveRight -= 1;
    if (this.keysPressed.d) moveRight += 1;

    if (moveForward !== 0 || moveRight !== 0) {
      const panSpeed = 30 * realDt;
      // İzometrik 45 derece eksenlerinde hareket
      const cosA = Math.cos(this.azimuthAngle);
      const sinA = Math.sin(this.azimuthAngle);

      const dx = (moveRight * cosA + moveForward * sinA) * panSpeed;
      const dz = (-moveRight * sinA + moveForward * cosA) * panSpeed;

      this.target.x += dx;
      this.target.z += dz;
      this.clampTargetToBounds();
      this.updateCameraTransform();
    }
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.inputEnabled) return;

    // Fare ise yalnızca sol tık (button === 0)
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.activePointers.size === 1) {
      this.isDragging = true;
      this.lastDragPosition = { x: e.clientX, y: e.clientY };
    } else if (this.activePointers.size === 2) {
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
    if (this.activePointers.size === 1 && this.isDragging) {
      const deltaX = e.clientX - this.lastDragPosition.x;
      const deltaY = e.clientY - this.lastDragPosition.y;
      this.lastDragPosition = { x: e.clientX, y: e.clientY };

      const currentViewSize = this.zoomLevels[this.currentZoomIndex];
      const unitsPerPixel = currentViewSize / this.viewportHeight;

      // Ekran piksel hareketini zemin düzlemi izometrik hareketine dönüştür
      const cosA = Math.cos(this.azimuthAngle);
      const sinA = Math.sin(this.azimuthAngle);
      const sinE = Math.sin(this.elevationAngle);

      const screenDx = -deltaX * unitsPerPixel;
      const screenDy = -deltaY * unitsPerPixel;

      const worldDx = (screenDx * cosA - (screenDy / sinE) * sinA) * 0.75;
      const worldDz = (-screenDx * sinA - (screenDy / sinE) * cosA) * 0.75;

      this.target.x += worldDx;
      this.target.z += worldDz;
      this.clampTargetToBounds();
      this.updateCameraTransform();
    } else if (this.activePointers.size === 2 && this.initialPinchDistance !== null) {
      // İki parmakla kıstırma (pinch zoom)
      const points = Array.from(this.activePointers.values());
      const currentDistance = Math.hypot(
        points[0].x - points[1].x,
        points[0].y - points[1].y
      );

      const pinchDelta = currentDistance - this.initialPinchDistance;
      const pinchThreshold = 40;

      if (pinchDelta > pinchThreshold) {
        // Yakınlaş (zoom in)
        this.stepZoom(-1);
        this.initialPinchDistance = currentDistance;
      } else if (pinchDelta < -pinchThreshold) {
        // Uzaklaş (zoom out)
        this.stepZoom(1);
        this.initialPinchDistance = currentDistance;
      }
    }
  }

  private onPointerUp(e: PointerEvent): void {
    this.activePointers.delete(e.pointerId);

    if (this.activePointers.size === 0) {
      this.isDragging = false;
      this.initialPinchDistance = null;
    } else if (this.activePointers.size === 1) {
      // Çift parmaktan tek parmağa geçildiğinde konumu güncelle
      const remaining = Array.from(this.activePointers.values())[0];
      this.lastDragPosition = { x: remaining.x, y: remaining.y };
      this.isDragging = true;
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

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.inputEnabled) return;
    const key = e.key.toLowerCase();
    if (key === 'w') this.keysPressed.w = true;
    if (key === 'a') this.keysPressed.a = true;
    if (key === 's') this.keysPressed.s = true;
    if (key === 'd') this.keysPressed.d = true;
  }

  private onKeyUp(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    if (key === 'w') this.keysPressed.w = false;
    if (key === 'a') this.keysPressed.a = false;
    if (key === 's') this.keysPressed.s = false;
    if (key === 'd') this.keysPressed.d = false;
  }

  private clampTargetToBounds(): void {
    this.target.x = THREE.MathUtils.clamp(this.target.x, 0, this.mapWidth);
    this.target.z = THREE.MathUtils.clamp(this.target.z, 0, this.mapHeight);
  }

  private updateProjection(): void {
    const aspect = this.viewportWidth / this.viewportHeight;
    const halfHeight = this.zoomLevels[this.currentZoomIndex];
    const halfWidth = halfHeight * aspect;

    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
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
