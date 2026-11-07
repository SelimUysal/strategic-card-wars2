import * as THREE from 'three';

export class SceneManager {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
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
    this.scene.background = new THREE.Color(0x121214);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
    directionalLight.position.set(30, 50, 40);
    this.scene.add(directionalLight);

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
    this.renderer.render(this.scene, camera);
  }

  public getScene(): THREE.Scene {
    return this.scene;
  }

  public getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  public destroy(): void {
    window.removeEventListener('resize', this.resizeListener);
    window.removeEventListener('orientationchange', this.resizeListener);
    this.renderer.dispose();
  }
}
