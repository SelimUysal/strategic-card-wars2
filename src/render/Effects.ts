import * as THREE from 'three';
import { Building } from '../buildings/Building';
import { BuildingManager } from '../buildings/BuildingManager';
import { EventManager } from '../core/EventManager';
import { TimeManager } from '../core/TimeManager';
import { Unit } from '../units/Unit';
import { UnitManager } from '../units/UnitManager';
import { FogOfWar } from '../world/FogOfWar';
import { QualityProfile } from './Atmosphere';

interface AttackPerformedEvent {
  attackerId: string;
  targetId: string;
  attackerPos: { x: number; y: number };
  targetPos: { x: number; y: number };
  type: 'melee' | 'arrow' | 'cannon' | 'stone' | 'ship';
}

interface ActiveProjectile {
  active: boolean;
  type: 'arrow' | 'cannon' | 'stone' | 'ship';
  startX: number;
  startY: number;
  startZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  duration: number;
  elapsed: number;
  peakHeight: number;
}

interface ActiveParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  drag: number;
  scaleStart: number;
  scaleEnd: number;
  duration: number;
  elapsed: number;
  color: THREE.Color;
}

interface ActiveSlash {
  active: boolean;
  x: number;
  y: number;
  z: number;
  angle: number;
  duration: number;
  elapsed: number;
}

interface ActiveRing {
  active: boolean;
  x: number;
  y: number;
  z: number;
  radiusStart: number;
  radiusEnd: number;
  duration: number;
  elapsed: number;
  color: THREE.Color;
}

interface ActiveDeliverySprite {
  active: boolean;
  sprite: THREE.Sprite;
  startX: number;
  startY: number;
  startZ: number;
  duration: number;
  elapsed: number;
}

export class Effects {
  private group: THREE.Group;
  private quality: QualityProfile;

  // Havuz sınırları (R11E E10 bütçesi)
  private readonly MAX_PROJECTILES = 30;
  private readonly MAX_PARTICLES: number;
  private readonly MAX_SLASHES = 20;
  private readonly MAX_RINGS = 10;
  private readonly MAX_DELIVERY_SPRITES = 8;

  // Havuz dizileri
  private projectiles: ActiveProjectile[] = [];
  private particles: ActiveParticle[] = [];
  private slashes: ActiveSlash[] = [];
  private rings: ActiveRing[] = [];
  private deliverySprites: ActiveDeliverySprite[] = [];

  // Instanced Meshes (G3 & E10: en çok 6 çizim çağrısı)
  private projectileMesh!: THREE.InstancedMesh;
  private particleMesh!: THREE.InstancedMesh;
  private slashMesh!: THREE.InstancedMesh;
  private ringMesh!: THREE.InstancedMesh;

  // Paylaşılan materyaller ve dokular
  private projectileGeom!: THREE.BufferGeometry;
  private projectileMat!: THREE.MeshBasicMaterial;
  private particleGeom!: THREE.BufferGeometry;
  private particleMat!: THREE.MeshBasicMaterial;
  private slashGeom!: THREE.BufferGeometry;
  private slashMat!: THREE.MeshBasicMaterial;
  private ringGeom!: THREE.BufferGeometry;
  private ringMat!: THREE.MeshBasicMaterial;

  private goldCanvasTex!: THREE.CanvasTexture;
  private woodCanvasTex!: THREE.CanvasTexture;
  private goldSpriteMat!: THREE.SpriteMaterial;
  private woodSpriteMat!: THREE.SpriteMaterial;

  // Dummy nesneler (çöp toplayıcı ve bellek tahsisini önlemek için)
  private dummyPos = new THREE.Vector3();
  private dummyScale = new THREE.Vector3();
  private dummyQuat = new THREE.Quaternion();
  private dummyMatrix = new THREE.Matrix4();
  private dummyColor = new THREE.Color();
  private hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

  // Periyodik sayaçlar
  private smokeTimer: number = 0;
  private walkDustTimer: number = 0;
  private gatherEffectTimer: number = 0;

  // İşçi teslimat durumu takibi (E8: +30 göstergesi için)
  private lastWorkerDepositing: Set<string> = new Set();

  // Olay abonelik referansları
  private onAttackBound: (data: AttackPerformedEvent) => void;
  private onUnitDiedBound: (data: { unit: Unit }) => void;
  private onBuildingDestroyedBound: (data: { building: Building }) => void;
  private onBuildingCompletedBound: (data: { building: Building }) => void;

  constructor(
    private scene: THREE.Scene,
    private eventManager: EventManager,
    private timeManager: TimeManager,
    private unitManager: UnitManager,
    private buildingManager: BuildingManager,
    private fogOfWar?: FogOfWar,
    qualityProfile: QualityProfile = 'yuksek'
  ) {
    this.quality = qualityProfile;
    this.MAX_PARTICLES = this.quality === 'dusuk' ? 80 : 150;
    this.group = new THREE.Group();
    this.group.name = 'EffectsGroup';

    this.initGeometriesAndMaterials();
    this.initPools();
    this.initDeliverySprites();

    this.scene.add(this.group);

    // Olay dinleyicilerini bağla
    this.onAttackBound = (e) => this.handleAttackPerformed(e);
    this.onUnitDiedBound = (e) => this.handleUnitDied(e.unit);
    this.onBuildingDestroyedBound = (e) => this.handleBuildingDestroyed(e.building);
    this.onBuildingCompletedBound = (e) => this.handleBuildingCompleted(e.building);

    this.eventManager.on('attackPerformed', this.onAttackBound);
    this.eventManager.on('unitDied', this.onUnitDiedBound);
    this.eventManager.on('buildingDestroyed', this.onBuildingDestroyedBound);
    this.eventManager.on('buildingCompleted', this.onBuildingCompletedBound);
  }

  public getGroup(): THREE.Group {
    return this.group;
  }

  public setQualityProfile(quality: QualityProfile): void {
    this.quality = quality;
  }

  // --- BAŞLANGIÇ: GEOMETRİ VE MATERYALLER ---

  private initGeometriesAndMaterials(): void {
    // 1. Mermiler Geometrisi: ince silindir / koni (Z yönünde sivriltilmiş)
    this.projectileGeom = new THREE.ConeGeometry(0.12, 0.6, 6);
    this.projectileGeom.rotateX(Math.PI / 2); // Z yönüne çevir
    this.projectileMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.projectileMesh = new THREE.InstancedMesh(
      this.projectileGeom,
      this.projectileMat,
      this.MAX_PROJECTILES
    );
    this.projectileMesh.count = this.MAX_PROJECTILES;
    this.projectileMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.projectileMesh.frustumCulled = false;
    this.group.add(this.projectileMesh);

    // 2. Parçacıklar Geometrisi: 20 üçgenli hafif ikosahedron
    this.particleGeom = new THREE.IcosahedronGeometry(0.14, 0);
    this.particleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.particleMesh = new THREE.InstancedMesh(
      this.particleGeom,
      this.particleMat,
      this.MAX_PARTICLES
    );
    this.particleMesh.count = this.MAX_PARTICLES;
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;
    this.group.add(this.particleMesh);

    // 3. Yakın Dövüş Kılıç İzi Geometrisi: yay dilimi
    this.slashGeom = new THREE.RingGeometry(0.4, 0.65, 8, 1, -Math.PI * 0.35, Math.PI * 0.7);
    this.slashGeom.rotateX(-Math.PI / 2); // Yatay düzleme yatır
    this.slashMat = new THREE.MeshBasicMaterial({
      color: 0xfffae6,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    this.slashMesh = new THREE.InstancedMesh(
      this.slashGeom,
      this.slashMat,
      this.MAX_SLASHES
    );
    this.slashMesh.count = this.MAX_SLASHES;
    this.slashMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.slashMesh.frustumCulled = false;
    this.group.add(this.slashMesh);

    // 4. Dalga / Halka Geometrisi: mancınık ve bina tamamlanma halkası
    this.ringGeom = new THREE.RingGeometry(0.85, 1.0, 24);
    this.ringGeom.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    this.ringMesh = new THREE.InstancedMesh(
      this.ringGeom,
      this.ringMat,
      this.MAX_RINGS
    );
    this.ringMesh.count = this.MAX_RINGS;
    this.ringMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ringMesh.frustumCulled = false;
    this.group.add(this.ringMesh);

    // Başlangıçta tüm örnekleri ölçek 0 yaparak gizle
    for (let i = 0; i < this.MAX_PROJECTILES; i++) {
      this.projectileMesh.setMatrixAt(i, this.hiddenMatrix);
    }
    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      this.particleMesh.setMatrixAt(i, this.hiddenMatrix);
    }
    for (let i = 0; i < this.MAX_SLASHES; i++) {
      this.slashMesh.setMatrixAt(i, this.hiddenMatrix);
    }
    for (let i = 0; i < this.MAX_RINGS; i++) {
      this.ringMesh.setMatrixAt(i, this.hiddenMatrix);
    }
    this.projectileMesh.instanceMatrix.needsUpdate = true;
    this.particleMesh.instanceMatrix.needsUpdate = true;
    this.slashMesh.instanceMatrix.needsUpdate = true;
    this.ringMesh.instanceMatrix.needsUpdate = true;
  }

  private initDeliverySprites(): void {
    // E8: Tuval üzerinde '+30' dokusu üret
    this.goldCanvasTex = this.createPlus30Texture('#f6e05e', '#744210');
    this.woodCanvasTex = this.createPlus30Texture('#ecc94b', '#5c3317');

    this.goldSpriteMat = new THREE.SpriteMaterial({
      map: this.goldCanvasTex,
      transparent: true,
      depthTest: false,
    });
    this.woodSpriteMat = new THREE.SpriteMaterial({
      map: this.woodCanvasTex,
      transparent: true,
      depthTest: false,
    });

    for (let i = 0; i < this.MAX_DELIVERY_SPRITES; i++) {
      const sprite = new THREE.Sprite(this.goldSpriteMat);
      sprite.visible = false;
      sprite.scale.set(1.4, 0.7, 1.0);
      this.group.add(sprite);

      this.deliverySprites.push({
        active: false,
        sprite,
        startX: 0,
        startY: 0,
        startZ: 0,
        duration: 1.0,
        elapsed: 0,
      });
    }
  }

  private createPlus30Texture(fillColor: string, strokeColor: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 128, 64);
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = strokeColor;
      ctx.strokeText('+30', 64, 32);
      ctx.fillStyle = fillColor;
      ctx.fillText('+30', 64, 32);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }

  private initPools(): void {
    for (let i = 0; i < this.MAX_PROJECTILES; i++) {
      this.projectiles.push({
        active: false,
        type: 'arrow',
        startX: 0,
        startY: 0,
        startZ: 0,
        targetX: 0,
        targetY: 0,
        targetZ: 0,
        duration: 0.5,
        elapsed: 0,
        peakHeight: 1.5,
      });
    }

    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        gravity: 0,
        drag: 0.96,
        scaleStart: 0.2,
        scaleEnd: 0,
        duration: 0.5,
        elapsed: 0,
        color: new THREE.Color(1, 1, 1),
      });
    }

    for (let i = 0; i < this.MAX_SLASHES; i++) {
      this.slashes.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        angle: 0,
        duration: 0.12,
        elapsed: 0,
      });
    }

    for (let i = 0; i < this.MAX_RINGS; i++) {
      this.rings.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        radiusStart: 0.5,
        radiusEnd: 3.0,
        duration: 0.5,
        elapsed: 0,
        color: new THREE.Color(1, 1, 1),
      });
    }
  }

  // --- SİS (FOG OF WAR) KONTROLÜ ---
  private isVisibleToPlayer(x: number, z: number): boolean {
    if (!this.fogOfWar) return true;
    if (!this.fogOfWar.isFogActive()) return true;
    return this.fogOfWar.isTileExplored(Math.floor(x), Math.floor(z));
  }

  // --- OLAY İŞLEYİCİLERİ ---

  private handleAttackPerformed(e: AttackPerformedEvent): void {
    // Sis altındaysa görsel efekt üretme
    if (!this.isVisibleToPlayer(e.targetPos.x, e.targetPos.y)) {
      return;
    }

    if (e.type === 'arrow') {
      // E1: Okçu (Tirendaz & Hisar) atışı
      this.spawnProjectile('arrow', e.attackerPos, e.targetPos, 16.0, 1.4);
    } else if (e.type === 'cannon') {
      // E2: Şahi top atışı
      this.spawnMuzzleFlashAndSmoke(e.attackerPos.x, 1.2, e.attackerPos.y);
      this.spawnProjectile('cannon', e.attackerPos, e.targetPos, 18.0, 1.0);
    } else if (e.type === 'ship') {
      // E2: Fetih Gemisi top atışı
      this.spawnMuzzleFlashAndSmoke(e.attackerPos.x, 1.5, e.attackerPos.y);
      this.spawnProjectile('ship', e.attackerPos, e.targetPos, 18.0, 1.2);
    } else if (e.type === 'stone') {
      // E2: Mancınık-ı Azam taş atışı
      this.spawnProjectile('stone', e.attackerPos, e.targetPos, 9.0, 4.5);
    } else if (e.type === 'melee') {
      // E3: Yakın dövüş vuruşu (Yeniçeri, Deliler, Fil)
      this.spawnMeleeHit(e.attackerPos, e.targetPos);
    }
  }

  private handleUnitDied(unit: Unit): void {
    if (!this.isVisibleToPlayer(unit.pos.x, unit.pos.y)) return;

    // E4: Birim ölümü toz bulutu (3-4 küçük toz pufu)
    const count = this.quality === 'dusuk' ? 2 : 4;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const speed = 0.6 + Math.random() * 0.5;
      this.spawnParticle({
        x: unit.pos.x + (Math.random() - 0.5) * 0.3,
        y: 0.2 + Math.random() * 0.3,
        z: unit.pos.y + (Math.random() - 0.5) * 0.3,
        vx: Math.cos(angle) * speed,
        vy: 0.8 + Math.random() * 0.6,
        vz: Math.sin(angle) * speed,
        gravity: 0.4,
        drag: 0.94,
        scaleStart: 0.2,
        scaleEnd: 0.45,
        duration: 0.55,
        color: new THREE.Color(0xd2c5b3), // Sıcak toz rengi
      });
    }
  }

  private handleBuildingDestroyed(building: Building): void {
    const center = building.getCenter();
    if (!this.isVisibleToPlayer(center.x, center.y)) return;

    // E4: Geniş toz patlaması + 5-6 havaya saçılan enkaz parçası
    const dustCount = this.quality === 'dusuk' ? 4 : 8;
    for (let i = 0; i < dustCount; i++) {
      const angle = (Math.PI * 2 * i) / dustCount;
      const speed = 1.2 + Math.random() * 1.0;
      this.spawnParticle({
        x: center.x + (Math.random() - 0.5) * 1.0,
        y: 0.4 + Math.random() * 0.5,
        z: center.y + (Math.random() - 0.5) * 1.0,
        vx: Math.cos(angle) * speed,
        vy: 1.5 + Math.random() * 1.2,
        vz: Math.sin(angle) * speed,
        gravity: 0.6,
        drag: 0.95,
        scaleStart: 0.35,
        scaleEnd: 0.85,
        duration: 0.8,
        color: new THREE.Color(0xbab0a0),
      });
    }

    // 4-6 enkaz parçası (yerçekimiyle fırlayan taş parçaları)
    const debrisCount = this.quality === 'dusuk' ? 3 : 6;
    for (let i = 0; i < debrisCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 2.0;
      this.spawnParticle({
        x: center.x,
        y: 0.8 + Math.random() * 0.8,
        z: center.y,
        vx: Math.cos(angle) * speed,
        vy: 3.5 + Math.random() * 2.5,
        vz: Math.sin(angle) * speed,
        gravity: 12.0,
        drag: 0.99,
        scaleStart: 0.25,
        scaleEnd: 0.2,
        duration: 0.75,
        color: Math.random() > 0.5 ? new THREE.Color(0x6b7280) : new THREE.Color(0x8c6b4f),
      });
    }
  }

  private handleBuildingCompleted(building: Building): void {
    const center = building.getCenter();
    if (!this.isVisibleToPlayer(center.x, center.y)) return;

    // E9: İnşaat tamamlanma beyaz-sarı ışıltı ve hafif toz halkası
    const rect = building.getRect();
    const radius = Math.max(rect.w, rect.h) * 0.65;

    this.spawnRing(center.x, 0.05, center.y, radius * 0.5, radius * 1.2, 0.6, new THREE.Color(0xfff3c4));

    // Çevresinde 5 küçük ışıltı
    for (let i = 0; i < 5; i++) {
      const angle = (Math.PI * 2 * i) / 5;
      this.spawnParticle({
        x: center.x + Math.cos(angle) * radius,
        y: 0.5 + Math.random() * 0.8,
        z: center.y + Math.sin(angle) * radius,
        vx: (Math.random() - 0.5) * 0.4,
        vy: 1.0 + Math.random() * 0.5,
        vz: (Math.random() - 0.5) * 0.4,
        gravity: 0.2,
        drag: 0.96,
        scaleStart: 0.18,
        scaleEnd: 0.0,
        duration: 0.45,
        color: new THREE.Color(0xffea79),
      });
    }
  }

  // --- EFEKT ÜRETİCİ METODLARI ---

  private spawnProjectile(
    type: 'arrow' | 'cannon' | 'stone' | 'ship',
    from: { x: number; y: number },
    to: { x: number; y: number },
    speed: number,
    baseArcHeight: number
  ): void {
    const dx = to.x - from.x;
    const dz = to.y - from.y;
    const dist = Math.hypot(dx, dz);
    const duration = Math.max(0.2, dist / speed);

    const startY = type === 'arrow' ? 1.0 : type === 'stone' ? 1.5 : 1.2;
    const targetY = 0.5;

    for (let i = 0; i < this.MAX_PROJECTILES; i++) {
      const p = this.projectiles[i];
      if (!p.active) {
        p.active = true;
        p.type = type;
        p.startX = from.x;
        p.startY = startY;
        p.startZ = from.y;
        p.targetX = to.x;
        p.targetY = targetY;
        p.targetZ = to.y;
        p.duration = duration;
        p.elapsed = 0;
        p.peakHeight = baseArcHeight + dist * 0.08;
        break;
      }
    }
  }

  private spawnMuzzleFlashAndSmoke(x: number, y: number, z: number): void {
    // Namluda kısa ateş
    this.spawnParticle({
      x,
      y,
      z,
      vx: (Math.random() - 0.5) * 0.4,
      vy: 0.8,
      vz: (Math.random() - 0.5) * 0.4,
      gravity: 0,
      drag: 0.92,
      scaleStart: 0.35,
      scaleEnd: 0.0,
      duration: 0.15,
      color: new THREE.Color(0xff9900),
    });

    // Namlu dumanı
    for (let i = 0; i < 2; i++) {
      this.spawnParticle({
        x: x + (Math.random() - 0.5) * 0.2,
        y: y + 0.1,
        z: z + (Math.random() - 0.5) * 0.2,
        vx: (Math.random() - 0.5) * 0.5,
        vy: 0.9 + Math.random() * 0.5,
        vz: (Math.random() - 0.5) * 0.5,
        gravity: -0.2, // Yükselir
        drag: 0.95,
        scaleStart: 0.2,
        scaleEnd: 0.5,
        duration: 0.4,
        color: new THREE.Color(0x718096),
      });
    }
  }

  private spawnImpactExplosion(type: 'arrow' | 'cannon' | 'stone' | 'ship', x: number, y: number, z: number): void {
    if (type === 'arrow') {
      // E1: Küçük kıvılcım
      for (let i = 0; i < 3; i++) {
        this.spawnParticle({
          x,
          y,
          z,
          vx: (Math.random() - 0.5) * 1.5,
          vy: 0.8 + Math.random() * 1.0,
          vz: (Math.random() - 0.5) * 1.5,
          gravity: 5.0,
          drag: 0.94,
          scaleStart: 0.12,
          scaleEnd: 0.0,
          duration: 0.18,
          color: new THREE.Color(0xfff3a8),
        });
      }
    } else if (type === 'cannon' || type === 'ship') {
      // E2: Ateş-toz patlaması
      for (let i = 0; i < 4; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = 1.0 + Math.random() * 1.5;
        this.spawnParticle({
          x,
          y: y + 0.2,
          z,
          vx: Math.cos(angle) * spd,
          vy: 1.2 + Math.random() * 1.5,
          vz: Math.sin(angle) * spd,
          gravity: 4.0,
          drag: 0.94,
          scaleStart: 0.25,
          scaleEnd: 0.0,
          duration: 0.25,
          color: new THREE.Color(0xff6600),
        });
      }
      for (let i = 0; i < 3; i++) {
        this.spawnParticle({
          x: x + (Math.random() - 0.5) * 0.3,
          y: y + 0.3,
          z: z + (Math.random() - 0.5) * 0.3,
          vx: (Math.random() - 0.5) * 0.8,
          vy: 1.0 + Math.random() * 0.8,
          vz: (Math.random() - 0.5) * 0.8,
          gravity: 0.2,
          drag: 0.95,
          scaleStart: 0.25,
          scaleEnd: 0.6,
          duration: 0.45,
          color: new THREE.Color(0x374151),
        });
      }
    } else if (type === 'stone') {
      // E2: Mancınık taşı düşünce toz patlaması + enkaz parçaları + yarıçap 3 halka parlaması
      this.spawnRing(x, 0.04, z, 0.6, 3.0, 0.45, new THREE.Color(0xe2d9cb));

      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * 2 * i) / 6;
        const spd = 1.2 + Math.random() * 1.2;
        this.spawnParticle({
          x,
          y: 0.3,
          z,
          vx: Math.cos(angle) * spd,
          vy: 1.5 + Math.random() * 1.0,
          vz: Math.sin(angle) * spd,
          gravity: 1.0,
          drag: 0.95,
          scaleStart: 0.35,
          scaleEnd: 0.8,
          duration: 0.6,
          color: new THREE.Color(0xb0a594),
        });
      }

      // Enkaz parçaları (küçük taşlar)
      for (let i = 0; i < 5; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = 1.5 + Math.random() * 2.0;
        this.spawnParticle({
          x,
          y: 0.5,
          z,
          vx: Math.cos(angle) * spd,
          vy: 3.0 + Math.random() * 2.0,
          vz: Math.sin(angle) * spd,
          gravity: 12.0,
          drag: 0.98,
          scaleStart: 0.22,
          scaleEnd: 0.18,
          duration: 0.6,
          color: new THREE.Color(0x5a6578),
        });
      }
    }
  }

  private spawnMeleeHit(from: { x: number; y: number }, to: { x: number; y: number }): void {
    // E3: Temas noktasında kıvılcım ve kılıç yay dilimi
    const midX = (from.x + to.x) * 0.5;
    const midZ = (from.y + to.y) * 0.5;
    const angle = Math.atan2(to.x - from.x, to.y - from.y);

    // Kılıç izi dilimi
    for (let i = 0; i < this.MAX_SLASHES; i++) {
      const s = this.slashes[i];
      if (!s.active) {
        s.active = true;
        s.x = midX;
        s.y = 0.8;
        s.z = midZ;
        s.angle = angle;
        s.duration = 0.12;
        s.elapsed = 0;
        break;
      }
    }

    // Beyazımsı sarı küçük kıvılcımlar
    for (let i = 0; i < 3; i++) {
      this.spawnParticle({
        x: midX,
        y: 0.8,
        z: midZ,
        vx: (Math.random() - 0.5) * 1.8,
        vy: 1.0 + Math.random() * 1.5,
        vz: (Math.random() - 0.5) * 1.8,
        gravity: 6.0,
        drag: 0.93,
        scaleStart: 0.12,
        scaleEnd: 0.0,
        duration: 0.15,
        color: new THREE.Color(0xfffae0),
      });
    }
  }

  private spawnParticle(p: {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    gravity: number;
    drag: number;
    scaleStart: number;
    scaleEnd: number;
    duration: number;
    color: THREE.Color;
  }): void {
    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      const pt = this.particles[i];
      if (!pt.active) {
        pt.active = true;
        pt.x = p.x;
        pt.y = p.y;
        pt.z = p.z;
        pt.vx = p.vx;
        pt.vy = p.vy;
        pt.vz = p.vz;
        pt.gravity = p.gravity;
        pt.drag = p.drag;
        pt.scaleStart = p.scaleStart;
        pt.scaleEnd = p.scaleEnd;
        pt.duration = p.duration;
        pt.elapsed = 0;
        pt.color.copy(p.color);
        break;
      }
    }
  }

  private spawnRing(
    x: number,
    y: number,
    z: number,
    radiusStart: number,
    radiusEnd: number,
    duration: number,
    color: THREE.Color
  ): void {
    for (let i = 0; i < this.MAX_RINGS; i++) {
      const r = this.rings[i];
      if (!r.active) {
        r.active = true;
        r.x = x;
        r.y = y;
        r.z = z;
        r.radiusStart = radiusStart;
        r.radiusEnd = radiusEnd;
        r.duration = duration;
        r.elapsed = 0;
        r.color.copy(color);
        break;
      }
    }
  }

  private spawnDeliveryIndicator(team: 'player' | 'enemy', type: 'gold' | 'wood'): void {
    const hq = this.buildingManager.getHq(team);
    if (!hq || hq.state === 'destroyed') return;
    const center = hq.getCenter();
    if (!this.isVisibleToPlayer(center.x, center.y)) return;

    for (let i = 0; i < this.MAX_DELIVERY_SPRITES; i++) {
      const s = this.deliverySprites[i];
      if (!s.active) {
        s.active = true;
        s.startX = center.x;
        s.startY = 3.2; // HQ üstü
        s.startZ = center.y;
        s.duration = 1.0;
        s.elapsed = 0;
        s.sprite.material = type === 'gold' ? this.goldSpriteMat : this.woodSpriteMat;
        s.sprite.position.set(s.startX, s.startY, s.startZ);
        s.sprite.material.opacity = 1.0;
        s.sprite.visible = true;
        break;
      }
    }
  }

  // --- DİNAMİK GÜNCELLEME DÖNGÜSÜ (GameLoop) ---

  public update(dt: number): void {
    // E10: Oyun duraklatıldığında efektler de donar
    if (this.timeManager.isPaused()) {
      return;
    }

    this.updateProjectiles(dt);
    this.updateParticles(dt);
    this.updateSlashes(dt);
    this.updateRings(dt);
    this.updateDeliverySprites(dt);

    // E5: Hasarlı bina dumanı
    this.smokeTimer += dt;
    if (this.smokeTimer >= 0.25) {
      this.smokeTimer = 0;
      this.updateDamagedBuildingsSmoke();
    }

    // E6 & E7 & E8: Birim ve işçi etkileri
    this.gatherEffectTimer += dt;
    this.walkDustTimer += dt;
    this.updateUnitsAndWorkers(dt);
  }

  private updateProjectiles(dt: number): void {
    let activeCount = 0;

    for (let i = 0; i < this.MAX_PROJECTILES; i++) {
      const p = this.projectiles[i];
      if (!p.active) {
        this.projectileMesh.setMatrixAt(i, this.hiddenMatrix);
        continue;
      }

      p.elapsed += dt;
      const t = Math.min(1.0, p.elapsed / p.duration);

      // Yay eğrisi: h(t) = 4 * peakHeight * t * (1 - t)
      const currentX = p.startX + (p.targetX - p.startX) * t;
      const currentZ = p.startZ + (p.targetZ - p.startZ) * t;
      const baseLinearY = p.startY + (p.targetY - p.startY) * t;
      const arcY = 4.0 * p.peakHeight * t * (1.0 - t);
      const currentY = baseLinearY + arcY;

      // Hız türevi ile yönelim hesapla
      const dtStep = 0.02;
      const nextT = Math.min(1.0, t + dtStep);
      const nextX = p.startX + (p.targetX - p.startX) * nextT;
      const nextZ = p.startZ + (p.targetZ - p.startZ) * nextT;
      const nextY = p.startY + (p.targetY - p.startY) * nextT + 4.0 * p.peakHeight * nextT * (1.0 - nextT);

      this.dummyPos.set(currentX, currentY, currentZ);

      // Boyut ve şekil ölçekleri
      if (p.type === 'arrow') {
        this.dummyScale.set(0.6, 0.6, 1.2);
        this.dummyColor.setHex(0xe2d4b7);
      } else if (p.type === 'cannon' || p.type === 'ship') {
        this.dummyScale.set(1.4, 1.4, 1.4);
        this.dummyColor.setHex(0x2d3748);
      } else {
        // stone
        this.dummyScale.set(2.2, 2.2, 2.2);
        this.dummyColor.setHex(0x718096);
      }

      // İleri vektörüne bak
      const dirX = nextX - currentX;
      const dirY = nextY - currentY;
      const dirZ = nextZ - currentZ;
      const len = Math.hypot(dirX, dirY, dirZ);
      if (len > 0.0001) {
        const forward = new THREE.Vector3(dirX / len, dirY / len, dirZ / len);
        this.dummyQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward);
      } else {
        this.dummyQuat.identity();
      }

      this.dummyMatrix.compose(this.dummyPos, this.dummyQuat, this.dummyScale);
      this.projectileMesh.setMatrixAt(i, this.dummyMatrix);
      this.projectileMesh.setColorAt(i, this.dummyColor);
      activeCount++;

      // Varış anı
      if (t >= 1.0) {
        p.active = false;
        this.projectileMesh.setMatrixAt(i, this.hiddenMatrix);
        this.spawnImpactExplosion(p.type, p.targetX, p.targetY, p.targetZ);
      }
    }

    if (activeCount > 0) {
      this.projectileMesh.instanceMatrix.needsUpdate = true;
      if (this.projectileMesh.instanceColor) {
        this.projectileMesh.instanceColor.needsUpdate = true;
      }
    }
  }

  private updateParticles(dt: number): void {
    let activeCount = 0;

    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) {
        this.particleMesh.setMatrixAt(i, this.hiddenMatrix);
        continue;
      }

      p.elapsed += dt;
      const t = p.elapsed / p.duration;
      if (t >= 1.0) {
        p.active = false;
        this.particleMesh.setMatrixAt(i, this.hiddenMatrix);
        continue;
      }

      // Fizik adımı
      p.vy -= p.gravity * dt;
      p.vx *= p.drag;
      p.vz *= p.drag;
      p.x += p.vx * dt;
      p.y = Math.max(0.04, p.y + p.vy * dt);
      p.z += p.vz * dt;

      // Boyut enterpolasyonu
      const currentScale = p.scaleStart + (p.scaleEnd - p.scaleStart) * t;
      this.dummyPos.set(p.x, p.y, p.z);
      this.dummyQuat.identity();
      this.dummyScale.set(currentScale, currentScale, currentScale);

      this.dummyMatrix.compose(this.dummyPos, this.dummyQuat, this.dummyScale);
      this.particleMesh.setMatrixAt(i, this.dummyMatrix);
      this.particleMesh.setColorAt(i, p.color);
      activeCount++;
    }

    if (activeCount > 0) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) {
        this.particleMesh.instanceColor.needsUpdate = true;
      }
    }
  }

  private updateSlashes(dt: number): void {
    let activeCount = 0;

    for (let i = 0; i < this.MAX_SLASHES; i++) {
      const s = this.slashes[i];
      if (!s.active) {
        this.slashMesh.setMatrixAt(i, this.hiddenMatrix);
        continue;
      }

      s.elapsed += dt;
      const t = s.elapsed / s.duration;
      if (t >= 1.0) {
        s.active = false;
        this.slashMesh.setMatrixAt(i, this.hiddenMatrix);
        continue;
      }

      // Kılıç izi hızla büyür ve kaybolur
      const scale = 1.0 + t * 0.5;
      this.dummyPos.set(s.x, s.y, s.z);
      this.dummyQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.angle);
      this.dummyScale.set(scale, scale, scale);

      this.dummyMatrix.compose(this.dummyPos, this.dummyQuat, this.dummyScale);
      this.slashMesh.setMatrixAt(i, this.dummyMatrix);
      activeCount++;
    }

    if (activeCount > 0) {
      this.slashMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private updateRings(dt: number): void {
    let activeCount = 0;

    for (let i = 0; i < this.MAX_RINGS; i++) {
      const r = this.rings[i];
      if (!r.active) {
        this.ringMesh.setMatrixAt(i, this.hiddenMatrix);
        continue;
      }

      r.elapsed += dt;
      const t = r.elapsed / r.duration;
      if (t >= 1.0) {
        r.active = false;
        this.ringMesh.setMatrixAt(i, this.hiddenMatrix);
        continue;
      }

      // Genişleme
      const currentRadius = r.radiusStart + (r.radiusEnd - r.radiusStart) * t;
      this.dummyPos.set(r.x, r.y, r.z);
      this.dummyQuat.identity();
      this.dummyScale.set(currentRadius, currentRadius, currentRadius);

      this.dummyMatrix.compose(this.dummyPos, this.dummyQuat, this.dummyScale);
      this.ringMesh.setMatrixAt(i, this.dummyMatrix);
      this.ringMesh.setColorAt(i, r.color);
      activeCount++;
    }

    if (activeCount > 0) {
      this.ringMesh.instanceMatrix.needsUpdate = true;
      if (this.ringMesh.instanceColor) {
        this.ringMesh.instanceColor.needsUpdate = true;
      }
    }
  }

  private updateDeliverySprites(dt: number): void {
    for (let i = 0; i < this.MAX_DELIVERY_SPRITES; i++) {
      const s = this.deliverySprites[i];
      if (!s.active) continue;

      s.elapsed += dt;
      const t = s.elapsed / s.duration;
      if (t >= 1.0) {
        s.active = false;
        s.sprite.visible = false;
        continue;
      }

      // 1 saniyede yukarı kayıp solar
      const currentY = s.startY + t * 1.4;
      s.sprite.position.set(s.startX, currentY, s.startZ);

      // Son 0.4 saniyede solar
      if (t > 0.6) {
        s.sprite.material.opacity = (1.0 - t) / 0.4;
      } else {
        s.sprite.material.opacity = 1.0;
      }
    }
  }

  // --- E5: HASARLI BİNA DUMANI ---
  private updateDamagedBuildingsSmoke(): void {
    const buildings = this.buildingManager.getBuildings();
    const damaged: Array<{ b: Building; pct: number }> = [];

    for (const b of buildings) {
      if (b.state === 'destroyed' || b.state === 'constructing') continue;
      const pct = b.hp / b.maxHp;
      if (pct < 0.5) {
        damaged.push({ b, pct });
      }
    }

    // Bütçe aşılmasın diye en az canı olanlar öncelikli, en çok 8 bina
    damaged.sort((a, b) => a.pct - b.pct);
    const count = Math.min(8, damaged.length);

    for (let i = 0; i < count; i++) {
      const item = damaged[i];
      const center = item.b.getCenter();
      if (!this.isVisibleToPlayer(center.x, center.y)) continue;

      const isCritical = item.pct < 0.25;
      const roofY = item.b.defId === 'hq' ? 4.0 : 3.0;

      // Yoğun veya ince duman parçacığı
      this.spawnParticle({
        x: center.x + (Math.random() - 0.5) * 0.6,
        y: roofY,
        z: center.y + (Math.random() - 0.5) * 0.6,
        vx: (Math.random() - 0.5) * 0.3,
        vy: 1.0 + Math.random() * 0.6,
        vz: (Math.random() - 0.5) * 0.3,
        gravity: -0.2, // Yükselme
        drag: 0.95,
        scaleStart: isCritical ? 0.3 : 0.18,
        scaleEnd: isCritical ? 0.65 : 0.4,
        duration: isCritical ? 0.9 : 0.7,
        color: isCritical ? new THREE.Color(0x27272a) : new THREE.Color(0xa1a1aa),
      });

      // Kritik ise (%25 altı) küçük kıvılcımlar
      if (isCritical && Math.random() < 0.4) {
        this.spawnParticle({
          x: center.x + (Math.random() - 0.5) * 0.4,
          y: roofY + 0.2,
          z: center.y + (Math.random() - 0.5) * 0.4,
          vx: (Math.random() - 0.5) * 0.8,
          vy: 1.2 + Math.random() * 0.8,
          vz: (Math.random() - 0.5) * 0.8,
          gravity: 2.0,
          drag: 0.94,
          scaleStart: 0.12,
          scaleEnd: 0.0,
          duration: 0.25,
          color: new THREE.Color(0xf97316),
        });
      }
    }
  }

  // --- E6, E7, E8: BİRİM VE İŞÇİ ETKİLERİ ---
  private updateUnitsAndWorkers(_dt: number): void {
    const allUnits = this.unitManager.getUnits();
    const isHighQuality = this.quality === 'yuksek';
    const doWalkDust = isHighQuality && this.walkDustTimer >= 0.25;
    const doGather = this.gatherEffectTimer >= 0.3;

    if (doWalkDust) {
      this.walkDustTimer = 0;
    }
    if (doGather) {
      this.gatherEffectTimer = 0;
    }

    const currentDepositing = new Set<string>();

    for (const u of allUnits) {
      if (u.state === 'dead') continue;
      const isVisible = this.isVisibleToPlayer(u.pos.x, u.pos.y);

      // E8: Kaynak teslimatı durumu takibi
      if (u.workerState === 'depositing') {
        currentDepositing.add(u.id);
        if (!this.lastWorkerDepositing.has(u.id)) {
          // Yeni teslimat gerçekleşti!
          const type = u.carriedType || (u.defId === 'altin_madencisi' ? 'gold' : 'wood');
          this.spawnDeliveryIndicator(u.team, type);
        }
      }

      if (!isVisible) continue;

      // E6: Yürüme tozu (Yalnızca 'yuksek' kalitede)
      if (doWalkDust && u.state === 'moving') {
        const isDeli = u.defId === 'deliler';
        if (isDeli || Math.random() < 0.5) {
          this.spawnParticle({
            x: u.pos.x + (Math.random() - 0.5) * 0.2,
            y: 0.06,
            z: u.pos.y + (Math.random() - 0.5) * 0.2,
            vx: (Math.random() - 0.5) * 0.2,
            vy: 0.35 + Math.random() * 0.25,
            vz: (Math.random() - 0.5) * 0.2,
            gravity: 0.1,
            drag: 0.94,
            scaleStart: 0.12,
            scaleEnd: 0.22,
            duration: 0.35,
            color: new THREE.Color(0xd7cec7),
          });
        }
      }

      // E7: Toplama efekti
      if (doGather && (u.state === 'gathering' || u.workerState === 'gathering')) {
        if (u.defId === 'altin_madencisi') {
          // Altın kıvılcımı
          this.spawnParticle({
            x: u.pos.x + Math.cos(u.rotationY) * 0.4 + (Math.random() - 0.5) * 0.2,
            y: 0.5 + Math.random() * 0.4,
            z: u.pos.y + Math.sin(u.rotationY) * 0.4 + (Math.random() - 0.5) * 0.2,
            vx: (Math.random() - 0.5) * 0.6,
            vy: 0.8 + Math.random() * 0.6,
            vz: (Math.random() - 0.5) * 0.6,
            gravity: 1.5,
            drag: 0.94,
            scaleStart: 0.14,
            scaleEnd: 0.0,
            duration: 0.25,
            color: new THREE.Color(0xfacc15),
          });
        } else if (u.defId === 'oduncu') {
          // Ahşap talaşı
          this.spawnParticle({
            x: u.pos.x + Math.cos(u.rotationY) * 0.4 + (Math.random() - 0.5) * 0.2,
            y: 0.6 + Math.random() * 0.3,
            z: u.pos.y + Math.sin(u.rotationY) * 0.4 + (Math.random() - 0.5) * 0.2,
            vx: (Math.random() - 0.5) * 0.8,
            vy: 0.9 + Math.random() * 0.5,
            vz: (Math.random() - 0.5) * 0.8,
            gravity: 4.0,
            drag: 0.95,
            scaleStart: 0.12,
            scaleEnd: 0.08,
            duration: 0.3,
            color: new THREE.Color(0x92400e),
          });
        }
      }
    }

    this.lastWorkerDepositing = currentDepositing;
  }

  // --- TEMİZLİK (DISPOSE) ---
  public destroy(): void {
    this.eventManager.off('attackPerformed', this.onAttackBound);
    this.eventManager.off('unitDied', this.onUnitDiedBound);
    this.eventManager.off('buildingDestroyed', this.onBuildingDestroyedBound);
    this.eventManager.off('buildingCompleted', this.onBuildingCompletedBound);

    this.scene.remove(this.group);

    this.projectileGeom.dispose();
    this.projectileMat.dispose();
    this.particleGeom.dispose();
    this.particleMat.dispose();
    this.slashGeom.dispose();
    this.slashMat.dispose();
    this.ringGeom.dispose();
    this.ringMat.dispose();

    this.goldCanvasTex.dispose();
    this.woodCanvasTex.dispose();
    this.goldSpriteMat.dispose();
    this.woodSpriteMat.dispose();
  }
}
