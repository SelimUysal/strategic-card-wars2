import * as THREE from 'three';
import { EventManager } from '../core/EventManager';
import { BUILDINGS } from '../data/buildings';
import { BuildingId, Team, TilePos } from '../types';
import { FogOfWar } from '../world/FogOfWar';
import { GameMap } from '../world/MapConfig';
import { Pathfinding } from '../world/Pathfinding';
import { ModifierRegistry } from '../units/UnitStats';
import { Building, BuildingState } from './Building';
import { BuildingModels } from '../render/BuildingModels';

interface BuildingVisualEntry {
  group: THREE.Group;
  modelGroup: THREE.Group;
  scaffoldGroup: THREE.Group;
  lastState: BuildingState;
  currentDamageStage: 'normal' | 'damaged' | 'heavy';
  originalColors: Map<THREE.Mesh, THREE.Color>;
}

interface CollapsingBuilding {
  visual: THREE.Group;
  timer: number;
  w: number;
  h: number;
  position: THREE.Vector3;
}

interface RubbleEntry {
  group: THREE.Group;
  age: number;
}

export class BuildingManager {
  private buildings: Map<string, Building> = new Map();
  private buildingVisuals: Map<string, BuildingVisualEntry> = new Map();
  private collapsingBuildings: CollapsingBuilding[] = [];
  private rubbles: RubbleEntry[] = [];
  private nextBuildingId: number = 1;

  // Çizim grubu
  private group: THREE.Group;
  private playerTeamHex: number = 0x2563eb;
  private enemyTeamHex: number = 0xdc2626;

  constructor(
    private map: GameMap,
    private pathfinding: Pathfinding,
    private eventManager?: EventManager,
    private modifierRegistry?: ModifierRegistry,
    private fogOfWar?: FogOfWar
  ) {
    this.group = new THREE.Group();

    // SPEC S1: Bonus eklenince veya kalkınca varlıkların maksimum canı değişir ve mevcut can ORANI korunur [EK]
    if (this.modifierRegistry) {
      this.modifierRegistry.onModifiersChanged(() => {
        for (const building of this.buildings.values()) {
          if (building.state === 'destroyed') continue;
          const oldMax = building.maxHp;
          const newMax = this.modifierRegistry!.getBuildingStat(building, 'structureMaxHp');
          if (newMax > 0 && oldMax > 0 && newMax !== oldMax) {
            const ratio = building.hp / oldMax;
            building.maxHp = newMax;
            building.hp = Math.max(1, Math.round(newMax * ratio));
          }
        }
      });
    }
  }

  public setTeamColors(playerHex: number | string, enemyHex: number | string): void {
    this.playerTeamHex = typeof playerHex === 'string' ? parseInt(playerHex.replace('#', ''), 16) : playerHex;
    this.enemyTeamHex = typeof enemyHex === 'string' ? parseInt(enemyHex.replace('#', ''), 16) : enemyHex;

    // Mevcut binaların takım renk parçalarını güncelle
    for (const [id, entry] of this.buildingVisuals.entries()) {
      const b = this.buildings.get(id);
      if (!b) continue;
      const teamColor = b.team === 'player' ? this.playerTeamHex : this.enemyTeamHex;
      entry.modelGroup.traverse((child) => {
        if (child instanceof THREE.Mesh && child.name === 'teamPart') {
          if (child.material && 'color' in child.material) {
            (child.material as THREE.MeshLambertMaterial).color.set(teamColor);
            const orig = entry.originalColors.get(child);
            if (orig) orig.set(teamColor);
          }
        }
      });
    }
  }

  // SPEC S5: spawnBuilding(defId, team, tile, state)
  // Pathfinding.blockRect ile kareleri yürünemez yapar
  public spawnBuilding(
    defId: BuildingId,
    team: Team,
    tile: TilePos,
    state: BuildingState = 'active'
  ): Building {
    const id = `b_${this.nextBuildingId++}`;
    const baseDef = BUILDINGS[defId];
    const initialMaxHp = this.modifierRegistry
      ? this.modifierRegistry.getBuildingStat({ defId, team }, 'structureMaxHp')
      : baseDef.hp;

    const building = new Building({
      id,
      defId,
      team,
      tile,
      maxHp: initialMaxHp,
      state,
      constructionProgress: state === 'active' ? 1 : 0,
    });

    // SPEC S5: Kareleri yürünemez yap
    this.pathfinding.blockRect(building.getRect());

    this.buildings.set(id, building);

    // Çizim görselini oluştur (D1: iskele ve yükselen model ile)
    const entry = this.createBuildingVisual(building);
    this.buildingVisuals.set(id, entry);
    this.group.add(entry.group);

    // Olay yayını
    if (this.eventManager) {
      this.eventManager.emit('buildingPlaced', { building });
    }

    return building;
  }

  // SPEC S5 & D3: removeBuilding(building)
  // unblockRect hemen çağrılır; kareler anında serbest kalır. Bina 0.6 sn çöküp 4 sn enkaz bırakır.
  public removeBuilding(building: Building): void {
    if (!this.buildings.has(building.id)) return;

    // D3: Kareleri hemen yürünebilir/inşa edilebilir yap (enkaz kuralları etkilemez)
    this.pathfinding.unblockRect(building.getRect());

    this.buildings.delete(building.id);

    // D3: Çizim görselini çökme animasyonu listesine al (0.6 sn sonra enkaza dönüşür)
    const entry = this.buildingVisuals.get(building.id);
    if (entry) {
      entry.scaffoldGroup.visible = false;
      const def = BUILDINGS[building.defId];
      const w = def ? def.footprint.w : 4;
      const h = def ? def.footprint.h : 4;

      this.collapsingBuildings.push({
        visual: entry.group,
        timer: 0,
        w,
        h,
        position: entry.group.position.clone(),
      });
      this.buildingVisuals.delete(building.id);
    }

    // Olay yayını
    if (this.eventManager) {
      this.eventManager.emit('buildingDestroyed', { building });
      if (building.defId === 'hq') {
        this.eventManager.emit('hqDestroyed', { team: building.team, building });
      }
    }
  }

  // SPEC S5: getBuildings(team)
  public getBuildings(team?: Team): Building[] {
    const list: Building[] = [];
    for (const b of this.buildings.values()) {
      if (team === undefined || b.team === team) {
        list.push(b);
      }
    }
    return list;
  }

  // SPEC S5: getBuildingsOfType(team, defId)
  public getBuildingsOfType(team: Team, defId: BuildingId): Building[] {
    const list: Building[] = [];
    for (const b of this.buildings.values()) {
      if (b.team === team && b.defId === defId && b.state !== 'destroyed') {
        list.push(b);
      }
    }
    return list;
  }

  // SPEC S5: getHq(team)
  public getHq(team: Team): Building | undefined {
    for (const b of this.buildings.values()) {
      if (b.team === team && b.defId === 'hq' && b.state !== 'destroyed') {
        return b;
      }
    }
    return undefined;
  }

  // SPEC S5: spawnHq(team) (haritadaki başlangıç karesine, state 'active', bedelsiz)
  public spawnHq(team: Team): Building {
    const startPos = team === 'player' ? this.map.playerStart : this.map.enemyStart;
    return this.spawnBuilding('hq', team, startPos, 'active');
  }

  // D1-D5: Çizim güncellemesi: inşaat iskelesi ve yükselmesi, hasar aşamaları, çökme ve enkaz
  public update(dt: number): void {
    const destroyed: Building[] = [];

    for (const building of this.buildings.values()) {
      if (building.state === 'destroyed' || building.hp <= 0) {
        destroyed.push(building);
        continue;
      }

      const entry = this.buildingVisuals.get(building.id);
      if (!entry) continue;

      // SPEC D5: FogOfWar.canPlayerSee(building) false ise çizilmez
      if (this.fogOfWar && !this.fogOfWar.canPlayerSee(building)) {
        entry.group.visible = false;
        continue;
      }
      entry.group.visible = true;

      // SPEC D1: İnşaattaki bina: iskele görünür, model aşağıdan yukarı yükselir ve soluk görünür
      if (building.state === 'constructing') {
        entry.scaffoldGroup.visible = true;
        const progress = Math.max(0.08, Math.min(1.0, building.constructionProgress));
        entry.modelGroup.scale.set(1, progress, 1);

        entry.modelGroup.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            child.material.transparent = true;
            child.material.opacity = 0.72;
          }
        });
      } else {
        // Bina aktif: iskele kalkar, model tam boy ve opak görünür
        entry.scaffoldGroup.visible = false;
        entry.modelGroup.scale.set(1, 1, 1);

        if (entry.lastState === 'constructing') {
          entry.modelGroup.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
              child.material.opacity = 1.0;
              child.material.transparent = false;
            }
          });
        }

        // SPEC D2: Hasar aşamaları (can >= %50 normal, %25-%50 yıpranmış, < %25 ağır hasar)
        const hpRatio = building.hp / building.maxHp;
        const newStage: 'normal' | 'damaged' | 'heavy' =
          hpRatio >= 0.5 ? 'normal' : hpRatio >= 0.25 ? 'damaged' : 'heavy';

        if (newStage !== entry.currentDamageStage) {
          entry.currentDamageStage = newStage;
          this.applyDamageStageVisuals(entry, newStage);
        }
      }

      entry.lastState = building.state;
    }

    // Yıkılan binaları kaldır
    for (const b of destroyed) {
      this.removeBuilding(b);
    }

    // SPEC D3: Çöken binaların animasyonu (0.6 sn çökme: scale.y 1 -> 0.25, hafif eğilme)
    for (let i = this.collapsingBuildings.length - 1; i >= 0; i--) {
      const col = this.collapsingBuildings[i];
      col.timer += dt;
      const progress = Math.min(1.0, col.timer / 0.6);

      col.visual.scale.set(1.0, 1.0 - progress * 0.75, 1.0);
      col.visual.rotation.z = progress * 0.15;
      col.visual.rotation.x = -progress * 0.08;

      if (col.timer >= 0.6) {
        // Bina görselini sahneden kaldır
        this.group.remove(col.visual);
        this.disposeObject(col.visual);

        // Yerinde 4 saniye sürecek enkaz modelini bırak
        const rubble = BuildingModels.createRubbleModel(col.w, col.h);
        rubble.position.copy(col.position);
        this.group.add(rubble);
        this.rubbles.push({ group: rubble, age: 0 });

        this.collapsingBuildings.splice(i, 1);
      }
    }

    // SPEC D3: Enkazların 4 saniye sonra solarak kalkması (son 1 sn fade out)
    for (let i = this.rubbles.length - 1; i >= 0; i--) {
      const r = this.rubbles[i];
      r.age += dt;

      if (r.age > 3.0) {
        const fade = Math.max(0, (4.0 - r.age) / 1.0);
        r.group.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            child.material.transparent = true;
            child.material.opacity = fade * 0.95;
          }
        });
      }

      if (r.age >= 4.0) {
        this.group.remove(r.group);
        this.disposeObject(r.group);
        this.rubbles.splice(i, 1);
      }
    }
  }

  // D2: Hasar aşaması görseli uygulama (koyulaşma ve hafif eğilme)
  private applyDamageStageVisuals(
    entry: BuildingVisualEntry,
    stage: 'normal' | 'damaged' | 'heavy'
  ): void {
    const darkenFactor = stage === 'normal' ? 1.0 : stage === 'damaged' ? 0.82 : 0.65;
    const tiltZ = stage === 'normal' ? 0 : stage === 'damaged' ? 0.02 : 0.045;
    const tiltX = stage === 'normal' ? 0 : stage === 'damaged' ? -0.015 : -0.035;

    entry.modelGroup.rotation.set(tiltX, 0, tiltZ);

    entry.modelGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material && 'color' in child.material) {
        const orig = entry.originalColors.get(child);
        if (orig) {
          (child.material as THREE.MeshLambertMaterial).color.copy(orig).multiplyScalar(darkenFactor);
        }
      }
    });
  }

  private createBuildingVisual(building: Building): BuildingVisualEntry {
    const def = BUILDINGS[building.defId];
    const w = def ? def.footprint.w : 4;
    const h = def ? def.footprint.h : 4;
    const height = BuildingModels.buildingModelHeight(building.defId);
    const teamColor = building.team === 'player' ? this.playerTeamHex : this.enemyTeamHex;

    const group = new THREE.Group();
    group.name = `building_${building.id}`;

    const modelGroup = BuildingModels.createBuildingVisualModel(building.defId, undefined, teamColor);
    const scaffoldGroup = BuildingModels.createScaffoldModel(w, h, height);

    group.add(modelGroup);
    group.add(scaffoldGroup);

    const center = building.getCenter();
    group.position.set(center.x, 0, center.y);

    scaffoldGroup.visible = building.state === 'constructing';

    const originalColors = new Map<THREE.Mesh, THREE.Color>();
    modelGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material && 'color' in child.material) {
        originalColors.set(child, (child.material as THREE.MeshLambertMaterial).color.clone());
      }
    });

    return {
      group,
      modelGroup,
      scaffoldGroup,
      lastState: building.state,
      currentDamageStage: 'normal',
      originalColors,
    };
  }

  // SPEC S1 / R5: Dışa açılan ortak üretici fonksiyon (BuildingModels'a delege eder)
  public static createBuildingVisualModel(
    defId: BuildingId,
    overrideMaterial?: THREE.Material,
    teamColor: number = 0x2563eb
  ): THREE.Group {
    return BuildingModels.createBuildingVisualModel(defId, overrideMaterial, teamColor);
  }

  public getGroup(): THREE.Group {
    return this.group;
  }

  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry) child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else if (child.material) {
          child.material.dispose();
        }
      }
    });
  }

  public dispose(): void {
    for (const entry of this.buildingVisuals.values()) {
      this.disposeObject(entry.group);
    }
    for (const col of this.collapsingBuildings) {
      this.disposeObject(col.visual);
    }
    for (const r of this.rubbles) {
      this.disposeObject(r.group);
    }
    this.buildingVisuals.clear();
    this.collapsingBuildings = [];
    this.rubbles = [];
    this.buildings.clear();
    this.group.clear();
  }
}
