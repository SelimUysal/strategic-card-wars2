import * as THREE from 'three';
import { Atmosphere, QualityProfile } from '../render/Atmosphere';

export class SceneManager {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private atmosphere: Atmosphere;
  private resizeListener: () => void;
  private onResizeCallbacks: Set<(width: number, height: number) => void> = new Set();

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });

    const maxPixelRatio = 2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));

    this.scene = new THREE.Scene();

    // SPEC S2, S3, S4, S6: Atmosphere (Gökyüzü, sis, ışıklar, sahte gölge, kalite profili)
    this.atmosphere = new Atmosphere(this.scene, this.renderer);

    this.resizeListener = () => {
      this.handleResize();
    };

    window.addEventListener('resize', this.resizeListener);
    window.addEventListener('orientationchange', this.resizeListener);

    this.handleResize();
  }

  public handleResize(): void {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;

    this.renderer.setSize(width, height, false);

    for (const callback of this.onResizeCallbacks) {
      callback(width, height);
    }
  }

  public onResize(callback: (width: number, height: number) => void): void {
    this.onResizeCallbacks.add(callback);
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    callback(width, height);
  }

  public render(camera: THREE.Camera): void {
    // S2 & S4: Sis ve gölgeleri güncelle
    this.atmosphere.update(camera);
    this.renderer.render(this.scene, camera);
  }

  public getScene(): THREE.Scene {
    return this.scene;
  }

  public getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  public getAtmosphere(): Atmosphere {
    return this.atmosphere;
  }

  public getQualityProfile(): QualityProfile {
    return this.atmosphere.getQualityProfile();
  }

  public destroy(): void {
    window.removeEventListener('resize', this.resizeListener);
    window.removeEventListener('orientationchange', this.resizeListener);
    this.atmosphere.destroy();
    this.renderer.dispose();
  }
}

