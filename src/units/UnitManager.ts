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
import { UnitModels } from '../render/UnitModels';

export class UnitManager {
  private units: Map<string, Unit> = new Map();
  private nextUnitId: number = 1;
  private animTime: number = 0;
  private unitOverlay?: UnitOverlay;

  // Çizim grubu ve InstancedMesh koleksiyonları
  private group: THREE.Group;
  private instancedMeshes: Map<string, THREE.InstancedMesh> = new Map();
  private unitMaterial: THREE.MeshLambertMaterial;

  // Takım renkleri (varsayılan: oyuncu mavi, düşman kırmızı)
  private playerTeamHex: number = 0x2563eb;
  private enemyTeamHex: number = 0xdc2626;

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

  // R11C A4: Hasar anında parlama ve normal renk nesneleri
  private normalColor = new THREE.Color(1.0, 1.0, 1.0);
  private flashColor = new THREE.Color(2.5, 2.5, 2.5);

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

    // R11C G6 & G3: Köşe renklerini düz gölgeleme ile çizen hafif lambert materyal
    this.unitMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
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
    const pHex = typeof playerHex === 'string' ? parseInt(playerHex.replace('#', ''), 16) : playerHex;
    const eHex = typeof enemyHex === 'string' ? parseInt(enemyHex.replace('#', ''), 16) : enemyHex;
    this.playerTeamHex = pHex;
    this.enemyTeamHex = eHex;

    if (this.playerDiskMaterial) {
      this.playerDiskMaterial.color.set(pHex);
    }
    if (this.enemyDiskMaterial) {
      this.enemyDiskMaterial.color.set(eHex);
    }

    this.rebuildUnitGeometries();
  }

  // R11C: Takım rengi değiştiğinde InstancedMesh geometrilerini yeni köşe renkleriyle yeniden üretir
  private rebuildUnitGeometries(): void {
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
      for (const team of teams) {
        const hexColor = team === 'player' ? this.playerTeamHex : this.enemyTeamHex;
        const key = `${uid}_${team}`;
        const mesh = this.instancedMeshes.get(key);
        if (mesh) {
          mesh.geometry.dispose();
          mesh.geometry = UnitModels.createUnitGeometry(uid, hexColor);
        }
      }
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
  public removeUnit(unit: Unit, force: boolean = false): void {
    if (force || unit.deathTimer >= 0.8) {
      if (this.units.has(unit.id)) {
        this.units.delete(unit.id);
      }
    } else {
      // R11C A5: Ölüm animasyonu (~0.8 sn) oynatılabilmesi için dead durumuna al
      unit.state = 'dead';
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
      // R11C A4: Hasar parlama sayacını azalt
      if (unit.damageFlashTimer > 0) {
        unit.damageFlashTimer = Math.max(0, unit.damageFlashTimer - dt);
      }

      if (unit.state === 'dead') {
        unit.deathTimer += dt;
        if (unit.deathTimer >= 0.8) {
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
      this.removeUnit(u, true);
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
      // R11C A8: Yalnızca oyuncunun görüş alanında olan birimlerin dönüşümleri güncellenir
      if (this.fogOfWar && !this.fogOfWar.canPlayerSee(unit)) {
        continue;
      }

      const key = `${unit.defId}_${unit.team}`;
      const mesh = this.instancedMeshes.get(key);
      if (!mesh) continue;

      const idx = counts.get(key) || 0;
      if (idx >= this.MAX_INSTANCES_PER_TYPE) continue;

      const baseHeight = this.getUnitBaseHeight(unit.defId);

      let scale = 1.0;
      let scaleX = 1.0;
      let scaleY = 1.0;
      let scaleZ = 1.0;
      let bounceY = 0;
      let pitch = 0;
      let roll = 0;
      let lungeZ = 0;
      let deathSink = 0;

      // R11C A1: Boşta (idle) hafif nefes alma (scale ±%2, periyot ~2 sn)
      if (unit.state === 'idle') {
        const breath = 1.0 + 0.02 * Math.sin((this.animTime + unit.animPhase) * (Math.PI * 2 / 2.0));
        scaleY = breath;
        scaleX = 1.0 / Math.sqrt(breath);
        scaleZ = 1.0 / Math.sqrt(breath);
      }

      // R11C A2: Yürüme (moving) adım sekmesi ve roll, Deliler dörtnal, Fil/Gemi ağır dalgalanma
      if (unit.state === 'moving') {
        const def = UNITS[unit.defId];
        const speed = def ? def.moveSpeed : 1.5;

        if (unit.defId === 'deliler') {
          bounceY = Math.abs(Math.sin(this.animTime * 14 + unit.animPhase)) * 0.14;
          pitch = Math.sin(this.animTime * 14 + unit.animPhase) * 0.08;
          roll = Math.sin(this.animTime * 7 + unit.animPhase) * (3 * Math.PI / 180);
        } else if (unit.defId === 'zirhli_fil' || unit.defId === 'fetih_gemisi') {
          bounceY = Math.abs(Math.sin(this.animTime * 4.5 + unit.animPhase)) * 0.07;
          pitch = Math.sin(this.animTime * 3.5 + unit.animPhase) * 0.04;
          roll = Math.sin(this.animTime * 3.0 + unit.animPhase) * (2.5 * Math.PI / 180);
        } else {
          const stepFreq = speed * 4.5;
          bounceY = Math.abs(Math.sin(this.animTime * stepFreq + unit.animPhase)) * 0.12;
          roll = Math.sin(this.animTime * (stepFreq * 0.5) + unit.animPhase) * (3 * Math.PI / 180);
        }
      }

      // R11C A3: Saldırı (attacking) lunge / yay germe / top namlusu geri tepmesi
      if (unit.state === 'attacking') {
        const strikePulse = Math.pow(Math.max(0, Math.sin(this.animTime * 5.5 + unit.animPhase)), 3);
        if (unit.defId === 'tirendaz') {
          pitch = -strikePulse * 0.22; // geriye doğru yay germe yatışı
        } else if (unit.defId === 'sahi') {
          lungeZ = -strikePulse * 0.25; // ateş anında sert geri tepme
        } else {
          lungeZ = strikePulse * 0.15; // yakın dövüş hedefe doğru ani atılma (lunge)
        }
      }

      // R11C A6: İşçi toplama (gathering) kazma/balta sallama ritmi (pitch ±15°, 0.6 sn periyot)
      if (unit.state === 'gathering') {
        pitch = Math.sin((this.animTime + unit.animPhase) * (Math.PI * 2 / 0.6)) * (15 * Math.PI / 180);
      }

      // R11C A5: Ölüm devrilme (90° roll) + küçülme (~0.8 sn)
      if (unit.state === 'dead') {
        const deathProgress = Math.min(1.0, unit.deathTimer / 0.8);
        scale = Math.max(0, 1.0 - deathProgress * 0.95);
        roll += deathProgress * (Math.PI / 2);
        deathSink = deathProgress * baseHeight * 0.7;
      }

      // R11C A4: Hasar alma anında 0.15 sn boyunca beyaz flaş
      if (unit.damageFlashTimer > 0) {
        mesh.setColorAt(idx, this.flashColor);
      } else {
        mesh.setColorAt(idx, this.normalColor);
      }

      // Konum hesabı (lungeZ yönelime göre X/Z'ye eklenir)
      let posX = unit.pos.x;
      let posZ = unit.pos.y;
      if (lungeZ !== 0) {
        posX += Math.sin(unit.rotationY) * lungeZ;
        posZ += Math.cos(unit.rotationY) * lungeZ;
      }

      this.dummyPos.set(posX, baseHeight * scale + bounceY - deathSink, posZ);

      // Yönelim (pitch, rotationY, roll)
      this.euler.set(pitch, unit.rotationY, roll, 'YXZ');
      this.dummyQuat.setFromEuler(this.euler);
      this.dummyScale.set(scale * scaleX, scale * scaleY, scale * scaleZ);

      this.dummyMatrix.compose(this.dummyPos, this.dummyQuat, this.dummyScale);
      mesh.setMatrixAt(idx, this.dummyMatrix);
      counts.set(key, idx + 1);

      // SPEC S2: Takım renginde zemin halkası/diski çizimi (ölü birimde gösterilmez)
      if (unit.state !== 'dead') {
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
    }

    // Sayaçları ve matris güncellemelerini işle
    for (const [key, count] of counts.entries()) {
      const mesh = this.instancedMeshes.get(key);
      if (mesh) {
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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
      for (const team of teams) {
        const hexColor = team === 'player' ? this.playerTeamHex : this.enemyTeamHex;
        const geometry = UnitModels.createUnitGeometry(uid, hexColor);
        const mesh = new THREE.InstancedMesh(geometry, this.unitMaterial, this.MAX_INSTANCES_PER_TYPE);
        mesh.count = 0;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;

        // R11C A4: Hasar anında beyaz flaş için instanceColor tamponu tahsis et
        const colors = new Float32Array(this.MAX_INSTANCES_PER_TYPE * 3);
        colors.fill(1.0);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);

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

  // R11C M9: Model taban yüksekliği UnitModels.getUnitBaseHeight ile okunur
  private getUnitBaseHeight(defId: UnitId): number {
    return UnitModels.getUnitBaseHeight(defId);
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
    this.unitMaterial.dispose();
    this.group.clear();
    this.units.clear();
  }
}
