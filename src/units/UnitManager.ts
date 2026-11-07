import * as THREE from 'three';
import { EventManager } from '../core/EventManager';
import { UNITS } from '../data/units';
import { Team, UnitId } from '../types';
import { FogOfWar } from '../world/FogOfWar';
import { Unit } from './Unit';
import { ModifierRegistry } from './UnitStats';

export class UnitManager {
  private units: Map<string, Unit> = new Map();
  private nextUnitId: number = 1;
  private animTime: number = 0;

  // Çizim grubu ve InstancedMesh koleksiyonları
  private group: THREE.Group;
  private instancedMeshes: Map<string, THREE.InstancedMesh> = new Map();
  private playerMaterial: THREE.MeshStandardMaterial;
  private enemyMaterial: THREE.MeshStandardMaterial;

  private readonly MAX_INSTANCES_PER_TYPE = 250; // Nüfus sınırının (120) en az iki katı

  // Dummy matrix ve transform nesneleri (bellek tahsisini önlemek için)
  private dummyMatrix = new THREE.Matrix4();
  private dummyPos = new THREE.Vector3();
  private dummyQuat = new THREE.Quaternion();
  private dummyScale = new THREE.Vector3(1, 1, 1);
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor(
    private eventManager?: EventManager,
    private modifierRegistry?: ModifierRegistry,
    private fogOfWar?: FogOfWar
  ) {
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

  // Takım renklerini güncelleme fonksiyonu
  public setTeamColors(playerHex: number | string, enemyHex: number | string): void {
    this.playerMaterial.color.set(playerHex as any);
    this.enemyMaterial.color.set(enemyHex as any);
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

  // SPEC S3: update(dt) (hareketi yürütür, can kontrolü, animasyonlar ve çizim)
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

    // InstancedMesh örneklerini güncelle
    this.renderInstances();
  }

  private renderInstances(): void {
    // Her instancedMesh için aktif sayacı sıfırla
    const counts: Map<string, number> = new Map();
    for (const key of this.instancedMeshes.keys()) {
      counts.set(key, 0);
    }

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

      // Yükseklik tabanı (birimler zemin üzerinde durur)
      const baseHeight = 0.35;
      this.dummyPos.set(unit.pos.x, baseHeight + bounceY, unit.pos.y);

      // Y ekseni yönelimi
      this.euler.set(0, unit.rotationY, 0);
      this.dummyQuat.setFromEuler(this.euler);

      // Ölürken küçülme animasyonu [EK]
      let scale = 1.0;
      if (unit.state === 'dead') {
        scale = Math.max(0, 1.0 - unit.deathTimer / 0.5);
      }
      this.dummyScale.set(scale, scale, scale);

      this.dummyMatrix.compose(this.dummyPos, this.dummyQuat, this.dummyScale);
      mesh.setMatrixAt(idx, this.dummyMatrix);

      counts.set(key, idx + 1);
    }

    // Görünmeyen örneklerin ölçeğini sıfırla ve sayaçları ayarla
    for (const [key, count] of counts.entries()) {
      const mesh = this.instancedMeshes.get(key);
      if (mesh) {
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
      }
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
        const key = `${uid}_${team}`;
        this.instancedMeshes.set(key, mesh);
        this.group.add(mesh);
      }
    }
  }

  // SPEC S3: Basit geometriler (her tür ayırt edilebilsin)
  private createUnitGeometry(defId: UnitId): THREE.BufferGeometry {
    switch (defId) {
      case 'altin_madencisi':
      case 'oduncu':
        // İşçiler: kapsül
        return new THREE.CapsuleGeometry(0.18, 0.35, 4, 8);

      case 'tirendaz':
        // Tirendaz: küçük koni
        return new THREE.ConeGeometry(0.25, 0.65, 8);

      case 'yenicheri':
        // Yeniçeri: kutu
        return new THREE.BoxGeometry(0.45, 0.65, 0.45);

      case 'deliler':
        // Deliler: uzun kutu (süvari atı/binişi hissettiren form)
        return new THREE.BoxGeometry(0.4, 0.75, 0.9);

      case 'sahi': {
        // Şahi: silindir ve kısa kutu bileşimi
        const box = new THREE.BoxGeometry(0.65, 0.3, 0.85);
        const barrel = new THREE.CylinderGeometry(0.12, 0.16, 0.95, 8);
        barrel.rotateX(Math.PI / 2);
        barrel.translate(0, 0.22, 0.15);
        return this.mergeBufferGeometries([box, barrel]);
      }

      case 'zirhli_fil':
        // Zırhlı Fil: büyük kutu
        return new THREE.BoxGeometry(0.85, 0.9, 1.35);

      case 'fetih_gemisi':
        // Fetih Gemisi: büyük uzun kutu
        return new THREE.BoxGeometry(1.2, 0.95, 2.1);

      default:
        return new THREE.BoxGeometry(0.4, 0.6, 0.4);
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
    this.playerMaterial.dispose();
    this.enemyMaterial.dispose();
    this.group.clear();
    this.units.clear();
  }
}
