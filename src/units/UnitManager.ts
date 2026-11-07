import * as THREE from 'three';
import { EventManager } from '../core/EventManager';
import { MATCH_RULES } from '../data/matchRules';
import { UNITS } from '../data/units';
import { Team, UnitId } from '../types';
import { FogOfWar } from '../world/FogOfWar';
import { Pathfinding } from '../world/Pathfinding';
import { UnitOverlay } from '../ui/UnitOverlay';
import { Unit } from './Unit';
import { ModifierRegistry } from './UnitStats';

export class UnitManager {
  private units: Map<string, Unit> = new Map();
  private nextUnitId: number = 1;
  private animTime: number = 0;
  private unitOverlay?: UnitOverlay;

  // Çizim grubu ve InstancedMesh koleksiyonları
  private group: THREE.Group;
  private instancedMeshes: Map<string, THREE.InstancedMesh> = new Map();
  private playerMaterial: THREE.MeshStandardMaterial;
  private enemyMaterial: THREE.MeshStandardMaterial;

  // SPEC S2: Takım renginde yassı zemin diski (InstancedMesh)
  private playerDiskMesh!: THREE.InstancedMesh;
  private enemyDiskMesh!: THREE.InstancedMesh;
  private playerDiskMaterial!: THREE.MeshBasicMaterial;
  private enemyDiskMaterial!: THREE.MeshBasicMaterial;
  private diskGeometry!: THREE.BufferGeometry;

  private readonly MAX_INSTANCES_PER_TYPE = 250; // Nüfus sınırının (120) en az iki katı

  // Dummy matrix ve transform nesneleri (bellek tahsisini önlemek için)
  private dummyMatrix = new THREE.Matrix4();
  private dummyPos = new THREE.Vector3();
  private dummyQuat = new THREE.Quaternion();
  private dummyScale = new THREE.Vector3(1, 1, 1);
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');

  // SPEC S5: Yürünemez kareye itmeme kontrolü için Pathfinding referansı
  private pathfinding?: Pathfinding;

  constructor(
    private eventManager?: EventManager,
    private modifierRegistry?: ModifierRegistry,
    private fogOfWar?: FogOfWar,
    pathfinding?: Pathfinding
  ) {
    this.pathfinding = pathfinding;
    this.group = new THREE.Group();

    // Takım materyalleri (varsayılan: oyuncu mavi, düşman kırmızı)
    this.playerMaterial = new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      roughness: 0.4,
      metalness: 0.2,
    });
    this.enemyMaterial = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.4,
      metalness: 0.2,
    });

    this.initInstancedMeshes();

    // SPEC S1: Bonus eklenince veya kalkınca varlıkların maksimum canı değişir ve mevcut can ORANI korunur [EK]
    if (this.modifierRegistry) {
      this.modifierRegistry.onModifiersChanged(() => {
        for (const unit of this.units.values()) {
          if (unit.state === 'dead') continue;
          const oldMax = unit.maxHp;
          const newMax = this.modifierRegistry!.getUnitStat(unit, 'hp');
          if (newMax > 0 && oldMax > 0 && newMax !== oldMax) {
            const ratio = unit.hp / oldMax;
            unit.maxHp = newMax;
            unit.hp = Math.max(1, Math.round(newMax * ratio));
          }
        }
      });
    }
  }

  public setPathfinding(pathfinding: Pathfinding): void {
    this.pathfinding = pathfinding;
  }

  // R4 SPEC S3: UnitOverlay çağrı noktası
  public setUnitOverlay(overlay: UnitOverlay): void {
    this.unitOverlay = overlay;
  }

  // Takım renklerini güncelleme fonksiyonu
  public setTeamColors(playerHex: number | string, enemyHex: number | string): void {
    this.playerMaterial.color.set(playerHex as any);
    this.enemyMaterial.color.set(enemyHex as any);
    if (this.playerDiskMaterial) {
      this.playerDiskMaterial.color.set(playerHex as any);
    }
    if (this.enemyDiskMaterial) {
      this.enemyDiskMaterial.color.set(enemyHex as any);
    }
  }

  // SPEC S3: spawnUnit(defId, team, pos)
  public spawnUnit(
    defId: UnitId,
    team: Team,
    pos: { x: number; y: number }
  ): Unit {
    const id = `u_${this.nextUnitId++}`;
    const baseDef = UNITS[defId];
    const initialMaxHp = this.modifierRegistry
      ? this.modifierRegistry.getUnitStat({ defId, team }, 'hp')
      : baseDef.hp;

    const unit = new Unit({
      id,
      defId,
      team,
      maxHp: initialMaxHp,
      pos,
    });

    this.units.set(id, unit);

    // Olay yayını
    if (this.eventManager) {
      this.eventManager.emit('unitSpawned', { unit });
    }

    return unit;
  }

  // SPEC S3: removeUnit(unit)
  public removeUnit(unit: Unit): void {
    if (this.units.has(unit.id)) {
      this.units.delete(unit.id);
    }
  }

  // SPEC S3: getUnits(team)
  public getUnits(team?: Team): Unit[] {
    const list: Unit[] = [];
    for (const u of this.units.values()) {
      if (team === undefined || u.team === team) {
        list.push(u);
      }
    }
    return list;
  }

  // SPEC S3: getById(id)
  public getById(id: string): Unit | undefined {
    return this.units.get(id);
  }

  // SPEC S3: getSoldiers(team) (işçi olmayanlar)
  public getSoldiers(team: Team): Unit[] {
    const list: Unit[] = [];
    for (const u of this.units.values()) {
      if (u.team === team && u.state !== 'dead') {
        const def = UNITS[u.defId];
        if (def && !def.tags.includes('worker')) {
          list.push(u);
        }
      }
    }
    return list;
  }

  // SPEC S3: update(dt) (hareketi yürütür, can kontrolü, animasyonlar, hafif ayrılma ve çizim)
  public update(dt: number): void {
    this.animTime += dt;
    const unitsToRemove: Unit[] = [];

    // Birim mantığını güncelle
    for (const unit of this.units.values()) {
      if (unit.state === 'dead') {
        unit.deathTimer += dt;
        if (unit.deathTimer >= 0.5) {
          unitsToRemove.push(unit);
        }
        continue;
      }

      // Can kontrolü (0'a düştüyse öldü durumuna geçir ve olayı yayınla)
      if (unit.hp <= 0) {
        unit.state = 'dead';
        if (this.eventManager) {
          this.eventManager.emit('unitDied', { unit });
        }
        continue;
      }

      // Hareket güncellemesi
      if (unit.state === 'moving') {
        const effectiveSpeed = this.modifierRegistry
          ? this.modifierRegistry.getUnitStat(unit, 'moveSpeed')
          : UNITS[unit.defId].moveSpeed;

        unit.updateMovement(dt, effectiveSpeed);
      }
    }

    // Tamamen küçülüp ölen birimleri kaldır
    for (const u of unitsToRemove) {
      this.removeUnit(u);
    }

    // SPEC S5: Hafif ayrılma (soft separation) - aynı takımın idle/moving birimlerini ayırır
    this.applySeparation(dt);

    // InstancedMesh örneklerini güncelle
    this.renderInstances();

    // R4 SPEC S3: Birim üstü göstergeleri güncelle
    if (this.unitOverlay) {
      this.unitOverlay.update(Array.from(this.units.values()));
    }
  }

  // SPEC S5: Hafif ayrılma (uzamsal ızgara ile verimli)
  private applySeparation(dt: number): void {
    const separationRadius = MATCH_RULES.unitSeparationRadius;
    const separationRadiusSq = separationRadius * separationRadius;
    const cellSize = 1.5;

    // Uzamsal ızgara: takım ve hücreye göre gruplama
    const grid: Map<string, Unit[]> = new Map();

    for (const unit of this.units.values()) {
      if (unit.state === 'dead' || unit.hp <= 0) continue;
      // Yalnızca 'idle' veya 'moving' birimlere uygulanır; 'attacking' veya 'gathering' hariç
      if (unit.state !== 'idle' && unit.state !== 'moving') continue;

      const cx = Math.floor(unit.pos.x / cellSize);
      const cy = Math.floor(unit.pos.y / cellSize);
      const key = `${unit.team}_${cx}_${cy}`;

      let cell = grid.get(key);
      if (!cell) {
        cell = [];
        grid.set(key, cell);
      }
      cell.push(unit);
    }

    const pushForce = 2.2 * dt; // Hafif ve yumuşak ayrılma hızı

    for (const unit of this.units.values()) {
      if (unit.state === 'dead' || unit.hp <= 0) continue;
      if (unit.state !== 'idle' && unit.state !== 'moving') continue;

      const cx = Math.floor(unit.pos.x / cellSize);
      const cy = Math.floor(unit.pos.y / cellSize);

      let pushX = 0;
      let pushY = 0;

      // 3x3 komşu hücreleri kontrol et
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const key = `${unit.team}_${cx + ox}_${cy + oy}`;
          const neighbors = grid.get(key);
          if (!neighbors) continue;

          for (const other of neighbors) {
            if (other === unit) continue;

            const dx = unit.pos.x - other.pos.x;
            const dy = unit.pos.y - other.pos.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < separationRadiusSq) {
              const dist = Math.sqrt(distSq);
              if (dist > 0.0001) {
                const overlap = (separationRadius - dist) / separationRadius;
                pushX += (dx / dist) * overlap * pushForce;
                pushY += (dy / dist) * overlap * pushForce;
              } else {
                // Tam üst üste binmişse küçük deterministik yönde ayır
                const hash = (unit.id.charCodeAt(unit.id.length - 1) % 8) * (Math.PI / 4);
                pushX += Math.cos(hash) * pushForce * 0.5;
                pushY += Math.sin(hash) * pushForce * 0.5;
              }
            }
          }
        }
      }

      if (pushX !== 0 || pushY !== 0) {
        const nextX = unit.pos.x + pushX;
        const nextY = unit.pos.y + pushY;

        // SPEC S5: Birimi yürünemez kareye asla itmez
        const nextTileX = Math.floor(nextX);
        const nextTileY = Math.floor(nextY);

        if (this.pathfinding) {
          if (this.pathfinding.isWalkable(nextTileX, nextTileY)) {
            unit.pos.x = nextX;
            unit.pos.y = nextY;
          } else {
            // Eksenleri bağımsız olarak dene
            if (this.pathfinding.isWalkable(nextTileX, Math.floor(unit.pos.y))) {
              unit.pos.x = nextX;
            } else if (this.pathfinding.isWalkable(Math.floor(unit.pos.x), nextTileY)) {
              unit.pos.y = nextY;
            }
          }
        } else {
          unit.pos.x = nextX;
          unit.pos.y = nextY;
        }
      }
    }
  }

  private renderInstances(): void {
    // Her instancedMesh için aktif sayacı sıfırla
    const counts: Map<string, number> = new Map();
    for (const key of this.instancedMeshes.keys()) {
      counts.set(key, 0);
    }
    let playerDiskCount = 0;
    let enemyDiskCount = 0;

    for (const unit of this.units.values()) {
      // SPEC S3: FogOfWar.canPlayerSee(unit) false ise çizilmez
      if (this.fogOfWar && !this.fogOfWar.canPlayerSee(unit)) {
        continue;
      }

      const key = `${unit.defId}_${unit.team}`;
      const mesh = this.instancedMeshes.get(key);
      if (!mesh) continue;

      const idx = counts.get(key) || 0;
      if (idx >= this.MAX_INSTANCES_PER_TYPE) continue;

      // Konum ve hafif zıplama animasyonu [EK]
      let bounceY = 0;
      if (unit.state === 'moving') {
        bounceY = Math.abs(Math.sin(this.animTime * 12 + parseFloat(unit.id.slice(2)) || 0)) * 0.12;
      }

      // SPEC S1: Yükseklik tabanı (modele göre zemin üzerine tam oturtulur)
      const baseHeight = this.getUnitBaseHeight(unit.defId);

      // Ölürken küçülme animasyonu [EK]
      let scale = 1.0;
      if (unit.state === 'dead') {
        scale = Math.max(0, 1.0 - unit.deathTimer / 0.5);
      }

      this.dummyPos.set(unit.pos.x, baseHeight * scale + bounceY, unit.pos.y);

      // Y ekseni yönelimi
      this.euler.set(0, unit.rotationY, 0);
      this.dummyQuat.setFromEuler(this.euler);
      this.dummyScale.set(scale, scale, scale);

      this.dummyMatrix.compose(this.dummyPos, this.dummyQuat, this.dummyScale);
      mesh.setMatrixAt(idx, this.dummyMatrix);
      counts.set(key, idx + 1);

      // SPEC S2: Takım renginde zemin halkası/diski çizimi
      const isPlayer = unit.team === 'player';
      const diskMesh = isPlayer ? this.playerDiskMesh : this.enemyDiskMesh;
      const diskIdx = isPlayer ? playerDiskCount : enemyDiskCount;

      if (diskIdx < this.MAX_INSTANCES_PER_TYPE * 8) {
        // Zemin halkası konumu: y = 0.04 (zemin kaplamasının hemen üstü)
        this.dummyPos.set(unit.pos.x, 0.04, unit.pos.y);
        this.euler.set(0, 0, 0);
        this.dummyQuat.setFromEuler(this.euler);

        // Birim türüne göre disk çapı ölçeği
        const diskScaleMult =
          unit.defId === 'zirhli_fil'
            ? 1.55
            : unit.defId === 'fetih_gemisi'
            ? 1.8
            : unit.defId === 'deliler'
            ? 1.25
            : unit.defId === 'sahi'
            ? 1.3
            : 1.0;

        const dScale = scale * diskScaleMult;
        this.dummyScale.set(dScale, dScale, dScale);
        this.dummyMatrix.compose(this.dummyPos, this.dummyQuat, this.dummyScale);
        diskMesh.setMatrixAt(diskIdx, this.dummyMatrix);

        if (isPlayer) playerDiskCount++;
        else enemyDiskCount++;
      }
    }

    // Görünmeyen örneklerin ölçeğini sıfırla ve sayaçları ayarla
    for (const [key, count] of counts.entries()) {
      const mesh = this.instancedMeshes.get(key);
      if (mesh) {
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
      }
    }

    // Zemin disklerinin sayaçlarını güncelle
    if (this.playerDiskMesh) {
      this.playerDiskMesh.count = playerDiskCount;
      this.playerDiskMesh.instanceMatrix.needsUpdate = true;
    }
    if (this.enemyDiskMesh) {
      this.enemyDiskMesh.count = enemyDiskCount;
      this.enemyDiskMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private initInstancedMeshes(): void {
    const unitIds: UnitId[] = [
      'altin_madencisi',
      'oduncu',
      'tirendaz',
      'yenicheri',
      'deliler',
      'sahi',
      'zirhli_fil',
      'fetih_gemisi',
    ];
    const teams: Team[] = ['player', 'enemy'];

    for (const uid of unitIds) {
      const geometry = this.createUnitGeometry(uid);
      for (const team of teams) {
        const material = team === 'player' ? this.playerMaterial : this.enemyMaterial;
        const mesh = new THREE.InstancedMesh(geometry, material, this.MAX_INSTANCES_PER_TYPE);
        mesh.count = 0;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        const key = `${uid}_${team}`;
        this.instancedMeshes.set(key, mesh);
        this.group.add(mesh);
      }
    }

    // SPEC S2: Takım renginde yassı zemin diski (halka)
    // Zemin düzleminde yatay (XZ): iç yarıçap 0.38, dış yarıçap 0.62
    this.diskGeometry = new THREE.RingGeometry(0.38, 0.62, 24);
    this.diskGeometry.rotateX(-Math.PI / 2);

    // SPEC S2: depthTest kapatılır ve renderOrder yükseltilir (bina/ağaç arkasında kalmaz)
    this.playerDiskMaterial = new THREE.MeshBasicMaterial({
      color: 0x2563eb,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.85,
    });

    this.enemyDiskMaterial = new THREE.MeshBasicMaterial({
      color: 0xdc2626,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.85,
    });

    this.playerDiskMesh = new THREE.InstancedMesh(
      this.diskGeometry,
      this.playerDiskMaterial,
      this.MAX_INSTANCES_PER_TYPE * 8
    );
    this.playerDiskMesh.renderOrder = 999;
    this.playerDiskMesh.frustumCulled = false;
    this.playerDiskMesh.count = 0;
    this.group.add(this.playerDiskMesh);

    this.enemyDiskMesh = new THREE.InstancedMesh(
      this.diskGeometry,
      this.enemyDiskMaterial,
      this.MAX_INSTANCES_PER_TYPE * 8
    );
    this.enemyDiskMesh.renderOrder = 999;
    this.enemyDiskMesh.frustumCulled = false;
    this.enemyDiskMesh.count = 0;
    this.group.add(this.enemyDiskMesh);
  }

  // SPEC S1: Birim taban yüksekliği (model merkezini zemine oturtmak için)
  private getUnitBaseHeight(defId: UnitId): number {
    switch (defId) {
      case 'altin_madencisi':
      case 'oduncu':
        return 0.675; // Toplam boy 1.35
      case 'tirendaz':
        return 0.65; // Boy 1.30
      case 'yenicheri':
        return 0.675; // Boy 1.35
      case 'deliler':
        return 0.8; // Boy 1.60
      case 'sahi':
        return 0.45; // Boy ~0.9
      case 'zirhli_fil':
        return 0.9; // Boy 1.80
      case 'fetih_gemisi':
        return 0.95; // Boy 1.90
      default:
        return 0.65;
    }
  }

  // SPEC S1: Büyütülmüş modeller (asker genişliği ~0.8, boy ~1.2-1.5, özel birimler daha büyük)
  private createUnitGeometry(defId: UnitId): THREE.BufferGeometry {
    switch (defId) {
      case 'altin_madencisi':
      case 'oduncu':
        // İşçiler: genişlik 0.70, boy 1.35 kare kapsül
        return new THREE.CapsuleGeometry(0.35, 0.65, 4, 8);

      case 'tirendaz':
        // Tirendaz: genişlik 0.80, boy 1.30 kare koni
        return new THREE.ConeGeometry(0.4, 1.3, 8);

      case 'yenicheri':
        // Yeniçeri: genişlik 0.80, boy 1.35 kare kutu
        return new THREE.BoxGeometry(0.8, 1.35, 0.8);

      case 'deliler':
        // Deliler: genişlik 0.85, boy 1.60, uzunluk 1.60 kare uzun süvari kutusu
        return new THREE.BoxGeometry(0.85, 1.6, 1.6);

      case 'sahi': {
        // Şahi: genişlik 1.0, boy ~0.9, uzunluk 1.70 kare şasi ve devasa namlu
        const carriage = new THREE.BoxGeometry(1.0, 0.5, 1.1);
        const barrel = new THREE.CylinderGeometry(0.22, 0.3, 1.6, 8);
        barrel.rotateX(Math.PI / 2);
        barrel.translate(0, 0.4, 0.2);
        return this.mergeBufferGeometries([carriage, barrel]);
      }

      case 'zirhli_fil':
        // Zırhlı Fil: genişlik 1.30, boy 1.80, uzunluk 1.90 kare dev gövde
        return new THREE.BoxGeometry(1.3, 1.8, 1.9);

      case 'fetih_gemisi':
        // Fetih Gemisi: genişlik 1.40, boy 1.90, uzunluk 2.60 kare devasa gövde
        return new THREE.BoxGeometry(1.4, 1.9, 2.6);

      default:
        return new THREE.BoxGeometry(0.8, 1.3, 0.8);
    }
  }

  // Harici kütüphane bağımlılığı olmadan iki BufferGeometry'yi birleştiren yardımcı fonksiyon
  private mergeBufferGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
    let totalPositions = 0;
    const nonIndexedList: THREE.BufferGeometry[] = [];

    for (const g of geos) {
      const nonIndexed = g.index ? g.toNonIndexed() : g.clone();
      nonIndexedList.push(nonIndexed);
      totalPositions += nonIndexed.attributes.position.array.length;
    }

    const mergedPositions = new Float32Array(totalPositions);
    let offset = 0;

    for (const g of nonIndexedList) {
      mergedPositions.set(g.attributes.position.array, offset);
      offset += g.attributes.position.array.length;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
    merged.computeVertexNormals();
    return merged;
  }

  public getGroup(): THREE.Group {
    return this.group;
  }

  public dispose(): void {
    for (const mesh of this.instancedMeshes.values()) {
      mesh.geometry.dispose();
    }
    if (this.diskGeometry) this.diskGeometry.dispose();
    if (this.playerDiskMaterial) this.playerDiskMaterial.dispose();
    if (this.enemyDiskMaterial) this.enemyDiskMaterial.dispose();
    this.playerMaterial.dispose();
    this.enemyMaterial.dispose();
    this.group.clear();
    this.units.clear();
  }
}
