import * as THREE from 'three';
import { EventManager } from '../core/EventManager';
import { TimeManager } from '../core/TimeManager';
import { MATCH_RULES } from '../data/matchRules';
import { Team } from '../types';
import { GameMap } from './MapConfig';

export interface VisionSource {
  x: number;
  y: number;
  vision: number;
}

export class FogOfWar {
  private width: number;
  private height: number;

  // Keşfedilen kareler maskesi (0: sis altında, 1: keşfedilmiş ve görünür)
  private exploredMask: Uint8Array;

  // SPEC S4: TASARIM KARARI - 1 kareye 1 piksel doku çözünürlüğü
  // (112x72 haritada 112x72 piksel ~32KB bellek tüketir, mobilde sıfır gecikme ve keskin/doğru keşif sınırı sağlar)
  private textureData: Uint8Array;
  private texture: THREE.DataTexture;
  private mesh: THREE.Mesh;
  private group: THREE.Group;

  // Görüş sağlayıcı fonksiyon (SPEC S5)
  private visionProvider: (() => VisionSource[]) | null = null;
  private updateTimer: number = 0;
  private readonly updateIntervalSec: number = 0.15; // Güncelleme sıklığı sınırı

  // SPEC S6: 'war' evresi ve kalıcı kalkış
  private isWarPhasePermanent: boolean = false;

  // SPEC S7: Oyuncu sisi yoksayar mı (II. Abdülhamid)
  private playerIgnoresFog: boolean = false;

  private onPhaseChangedBound: (phase: string) => void;

  constructor(
    private map: GameMap,
    private timeManager?: TimeManager,
    private eventManager?: EventManager
  ) {
    this.width = map.width;
    this.height = map.height;
    this.exploredMask = new Uint8Array(this.width * this.height);
    this.textureData = new Uint8Array(this.width * this.height * 4);

    this.group = new THREE.Group();

    // Doku ve materyal kurulumu
    this.texture = new THREE.DataTexture(
      this.textureData,
      this.width,
      this.height,
      THREE.RGBAFormat
    );
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;

    // Başlangıçta tüm kareleri sisle doldur (koyu gri/siyah yarı-saydam sis)
    this.initFogTexture();

    const geometry = new THREE.PlaneGeometry(this.width, this.height);
    const material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    // Haritanın üzerine yatay düzlem olarak yerleştir
    this.mesh.position.set(this.width / 2, 0.25, this.height / 2);
    this.mesh.rotation.x = -Math.PI / 2;

    this.group.add(this.mesh);

    // Başlangıçta oyuncu ana karargâh çevresini keşfet (6x6 HQ + görüş alanı)
    this.revealInitialPlayerArea();

    // SPEC S6: 'phaseChanged' olayı ile 'war' evresinde sisin KALICI olarak kalkması
    this.onPhaseChangedBound = (phase: string) => {
      if (phase === 'war') {
        this.setWarPhasePermanent();
      }
    };

    if (this.eventManager) {
      this.eventManager.on('phaseChanged', this.onPhaseChangedBound);
    }
  }

  private initFogTexture(): void {
    const fogR = 18;
    const fogG = 18;
    const fogB = 20;
    const fogAlpha = 230; // Sis yoğunluğu

    for (let i = 0; i < this.width * this.height; i++) {
      const offset = i * 4;
      this.textureData[offset] = fogR;
      this.textureData[offset + 1] = fogG;
      this.textureData[offset + 2] = fogB;
      this.textureData[offset + 3] = fogAlpha;
    }
    this.texture.needsUpdate = true;
  }

  private revealInitialPlayerArea(): void {
    const hqCenter = this.map.getHqCenter('player');
    const initialVision = 12; // HQ görüş alanı
    this.revealCircle(hqCenter.x, hqCenter.y, initialVision);
  }

  // Daire şeklinde kareleri keşfet
  public revealCircle(centerX: number, centerY: number, radius: number): void {
    const rInt = Math.ceil(radius);
    let changed = false;

    for (let dy = -rInt; dy <= rInt; dy++) {
      for (let dx = -rInt; dx <= rInt; dx++) {
        if (dx * dx + dy * dy <= radius * radius) {
          const tx = Math.floor(centerX) + dx;
          const ty = Math.floor(centerY) + dy;

          if (this.map.inBounds(tx, ty)) {
            const idx = ty * this.width + tx;
            if (this.exploredMask[idx] === 0) {
              this.exploredMask[idx] = 1;
              // Dokuda şeffaf yap
              // Three.js PlaneGeometry UV koordinatları y ekseninde ters gelebileceğinden
              // Doku satırı: (height - 1 - ty)
              const texOffset = ((this.height - 1 - ty) * this.width + tx) * 4;
              this.textureData[texOffset + 3] = 0; // Alpha 0 = tamamen açık
              changed = true;
            }
          }
        }
      }
    }

    if (changed) {
      this.texture.needsUpdate = true;
    }
  }

  // SPEC S5: Görüş kaynakları fonksiyonu
  public setVisionProvider(provider: () => VisionSource[]): void {
    this.visionProvider = provider;
  }

  // SPEC S7: Oyuncu sisi yoksayar mı (II. Abdülhamid)
  public setPlayerIgnoresFog(ignores: boolean): void {
    this.playerIgnoresFog = ignores;
    this.updateMeshVisibility();
  }

  // SPEC S6: 'war' evresine geçilince sis herkes için KALICI olarak kalkar
  public setWarPhasePermanent(): void {
    this.isWarPhasePermanent = true;
    this.updateMeshVisibility();
  }

  private updateMeshVisibility(): void {
    if (this.playerIgnoresFog || this.isWarPhasePermanent) {
      this.mesh.visible = false;
    } else {
      this.mesh.visible = true;
    }
  }

  public update(dt: number): void {
    if (!this.isFogActive()) return;

    this.updateTimer += dt;
    if (this.updateTimer >= this.updateIntervalSec) {
      this.updateTimer = 0;

      if (this.visionProvider) {
        const sources = this.visionProvider();
        for (const src of sources) {
          this.revealCircle(src.x, src.y, src.vision);
        }
      }
    }
  }

  // SPEC S6, S7, S8, S9: Oyuncunun varlığı görebilme kuralı
  public canPlayerSee(entity: { team: Team }): boolean {
    // 1. Oyuncunun kendi varlıkları her zaman görünür
    if (entity.team === 'player') return true;

    // 2. II. Abdülhamid etkisi (sis kapalıdır ve düşman baştan görünür)
    if (this.playerIgnoresFog) return true;

    // 3. 'war' evresine geçildiyse bütün varlıklar kalıcı olarak görünür
    if (this.isWarPhasePermanent) return true;

    // 4. Maç saati combatStartRealSec (300) ulaştıysa düşman görünür
    if (
      this.timeManager &&
      this.timeManager.matchClockRealSec >= MATCH_RULES.combatStartRealSec
    ) {
      return true;
    }

    // 5. SPEC S6: combatStartRealSec'ten önce düşman varlıkları oyuncuya GÖRÜNMEZ
    return false;
  }

  public isTileExplored(x: number, y: number): boolean {
    if (!this.isFogActive()) return true;
    if (!this.map.inBounds(x, y)) return false;
    return this.exploredMask[y * this.width + x] === 1;
  }

  public isFogActive(): boolean {
    if (this.playerIgnoresFog) return false;
    if (this.isWarPhasePermanent) return false;
    if (
      this.timeManager &&
      this.timeManager.matchClockRealSec >= MATCH_RULES.combatStartRealSec
    ) {
      return false;
    }
    return true;
  }

  public getExploredMask(): Uint8Array {
    return this.exploredMask;
  }

  public reset(): void {
    this.isWarPhasePermanent = false;
    this.playerIgnoresFog = false;
    this.exploredMask.fill(0);
    this.initFogTexture();
    this.revealInitialPlayerArea();
    this.updateMeshVisibility();
  }

  public getGroup(): THREE.Group {
    return this.group;
  }

  public dispose(): void {
    if (this.eventManager) {
      this.eventManager.off('phaseChanged', this.onPhaseChangedBound);
    }
    this.texture.dispose();
    this.mesh.geometry.dispose();
    if (Array.isArray(this.mesh.material)) {
      this.mesh.material.forEach((m) => m.dispose());
    } else {
      this.mesh.material.dispose();
    }
    this.group.clear();
  }
}
