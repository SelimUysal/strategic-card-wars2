import * as THREE from 'three';
import { EventManager } from '../core/EventManager';
import { BUILDINGS } from '../data/buildings';
import { BuildingId, Team, TilePos } from '../types';
import { FogOfWar } from '../world/FogOfWar';
import { GameMap } from '../world/MapConfig';
import { Pathfinding } from '../world/Pathfinding';
import { ModifierRegistry } from '../units/UnitStats';
import { Building, BuildingState } from './Building';

export class BuildingManager {
  private buildings: Map<string, Building> = new Map();
  private buildingVisuals: Map<string, THREE.Group> = new Map();
  private nextBuildingId: number = 1;

  // Çizim grubu
  private group: THREE.Group;
  private playerTeamHex: number = 0x2563eb;
  private enemyTeamHex: number = 0xdc2626;

  // Paylaşılan geometriler
  private geometries: Map<string, THREE.BufferGeometry> = new Map();

  constructor(
    private map: GameMap,
    private pathfinding: Pathfinding,
    private eventManager?: EventManager,
    private modifierRegistry?: ModifierRegistry,
    private fogOfWar?: FogOfWar
  ) {
    this.group = new THREE.Group();
    this.initGeometries();

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
    for (const [id, visual] of this.buildingVisuals.entries()) {
      const b = this.buildings.get(id);
      if (!b) continue;
      const teamColor = b.team === 'player' ? this.playerTeamHex : this.enemyTeamHex;
      visual.traverse((child) => {
        if (child instanceof THREE.Mesh && child.name === 'teamPart') {
          (child.material as THREE.MeshStandardMaterial).color.set(teamColor);
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

    // Çizim görselini oluştur
    const visual = this.createBuildingVisual(building);
    this.buildingVisuals.set(id, visual);
    this.group.add(visual);

    // Olay yayını
    if (this.eventManager) {
      this.eventManager.emit('buildingPlaced', { building });
    }

    return building;
  }

  // SPEC S5: removeBuilding(building) (unblockRect)
  public removeBuilding(building: Building): void {
    if (!this.buildings.has(building.id)) return;

    // Yürünemezliği kaldır
    this.pathfinding.unblockRect(building.getRect());

    this.buildings.delete(building.id);

    // Görseli kaldır ve temizle
    const visual = this.buildingVisuals.get(building.id);
    if (visual) {
      this.group.remove(visual);
      visual.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      this.buildingVisuals.delete(building.id);
    }

    // Olay yayını
    if (this.eventManager) {
      this.eventManager.emit('buildingDestroyed', { building });
      // Ana karargâh yıkılınca hqDestroyed (takımla) olayını yayınlar
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

  // Çizim güncellemesi: inşaat yüksekliği artışı ve FogOfWar görünürlüğü
  public update(_dt: number): void {
    const destroyed: Building[] = [];

    for (const building of this.buildings.values()) {
      if (building.state === 'destroyed') {
        destroyed.push(building);
        continue;
      }

      const visual = this.buildingVisuals.get(building.id);
      if (!visual) continue;

      // SPEC S5: FogOfWar.canPlayerSee(building) false ise çizilmez
      if (this.fogOfWar && !this.fogOfWar.canPlayerSee(building)) {
        visual.visible = false;
        continue;
      }
      visual.visible = true;

      // SPEC S5: İnşaattaki bina yüksekliği ilerlemeyle artar [EK]
      if (building.state === 'constructing') {
        const progress = Math.max(0.1, Math.min(1.0, building.constructionProgress));
        visual.scale.set(1, progress, 1);
      } else {
        visual.scale.set(1, 1, 1);
      }
    }

    for (const b of destroyed) {
      this.removeBuilding(b);
    }
  }

  private static sharedGeometries: Map<string, THREE.BufferGeometry> = new Map();

  private static getSharedGeometries(): Map<string, THREE.BufferGeometry> {
    if (this.sharedGeometries.size === 0) {
      // HQ: 6x6 tabanlı saray / kale yapısı
      this.sharedGeometries.set('hq_base', new THREE.BoxGeometry(5.2, 2.2, 5.2));
      this.sharedGeometries.set('hq_roof', new THREE.ConeGeometry(2.2, 1.4, 4));

      // Standart Kışlalar: 4x4
      this.sharedGeometries.set('barracks_base', new THREE.BoxGeometry(3.4, 1.6, 3.4));
      this.sharedGeometries.set('barracks_roof', new THREE.BoxGeometry(3.6, 0.35, 3.6));

      // Tersane: 5x5 daha geniş
      this.sharedGeometries.set('tersane_base', new THREE.BoxGeometry(4.4, 1.2, 4.4));
      this.sharedGeometries.set('tersane_roof', new THREE.BoxGeometry(4.6, 0.3, 4.6));

      // Hisar: 3x3 silindir kule
      this.sharedGeometries.set('hisar_tower', new THREE.CylinderGeometry(1.2, 1.35, 2.6, 12));
      this.sharedGeometries.set('hisar_top', new THREE.CylinderGeometry(1.4, 1.4, 0.4, 12));

      // Mancınık-ı Azam: 4x4 kutu ve atış kolu
      this.sharedGeometries.set('mancinik_base', new THREE.BoxGeometry(3.0, 0.8, 3.0));
      const armGeom = new THREE.BoxGeometry(0.35, 0.35, 2.4);
      armGeom.rotateX(-Math.PI / 4);
      this.sharedGeometries.set('mancinik_arm', armGeom);
    }
    return this.sharedGeometries;
  }

  // SPEC S1: Ortak üretici fonksiyon: GERÇEK bina model geometrisini dışa açar
  public static createBuildingVisualModel(
    defId: BuildingId,
    overrideMaterial?: THREE.Material,
    teamColor: number = 0x2563eb
  ): THREE.Group {
    const visual = new THREE.Group();
    const geoms = BuildingManager.getSharedGeometries();

    const stoneMat = overrideMaterial || new THREE.MeshStandardMaterial({
      color: 0x8a8479,
      roughness: 0.7,
      metalness: 0.1,
    });
    const woodMat = overrideMaterial || new THREE.MeshStandardMaterial({
      color: 0x6e4a2d,
      roughness: 0.8,
    });
    const teamMat = overrideMaterial || new THREE.MeshStandardMaterial({
      color: teamColor,
      roughness: 0.4,
      metalness: 0.2,
    });

    switch (defId) {
      case 'hq': {
        const base = new THREE.Mesh(geoms.get('hq_base'), stoneMat);
        base.position.y = 1.1;
        base.castShadow = true;
        base.receiveShadow = true;
        visual.add(base);

        const roof = new THREE.Mesh(geoms.get('hq_roof'), teamMat);
        roof.name = 'teamPart';
        roof.position.y = 2.2 + 0.7;
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        visual.add(roof);
        break;
      }

      case 'hisar': {
        const tower = new THREE.Mesh(geoms.get('hisar_tower'), stoneMat);
        tower.position.y = 1.3;
        tower.castShadow = true;
        tower.receiveShadow = true;
        visual.add(tower);

        const top = new THREE.Mesh(geoms.get('hisar_top'), teamMat);
        top.name = 'teamPart';
        top.position.y = 2.6 + 0.2;
        top.castShadow = true;
        visual.add(top);
        break;
      }

      case 'tersane': {
        const base = new THREE.Mesh(geoms.get('tersane_base'), woodMat);
        base.position.y = 0.6;
        base.castShadow = true;
        base.receiveShadow = true;
        visual.add(base);

        const roof = new THREE.Mesh(geoms.get('tersane_roof'), teamMat);
        roof.name = 'teamPart';
        roof.position.y = 1.2 + 0.15;
        roof.castShadow = true;
        visual.add(roof);
        break;
      }

      case 'mancinik_i_azam': {
        const base = new THREE.Mesh(geoms.get('mancinik_base'), woodMat);
        base.position.y = 0.4;
        base.castShadow = true;
        base.receiveShadow = true;
        visual.add(base);

        const arm = new THREE.Mesh(geoms.get('mancinik_arm'), teamMat);
        arm.name = 'teamPart';
        arm.position.set(0, 0.8, 0);
        arm.castShadow = true;
        visual.add(arm);
        break;
      }

      default: {
        const base = new THREE.Mesh(geoms.get('barracks_base'), stoneMat);
        base.position.y = 0.8;
        base.castShadow = true;
        base.receiveShadow = true;
        visual.add(base);

        const roof = new THREE.Mesh(geoms.get('barracks_roof'), teamMat);
        roof.name = 'teamPart';
        roof.position.y = 1.6 + 0.17;
        roof.castShadow = true;
        visual.add(roof);
        break;
      }
    }

    visual.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.frustumCulled = false;
      }
    });

    return visual;
  }

  private initGeometries(): void {
    BuildingManager.getSharedGeometries();
  }

  private createBuildingVisual(building: Building): THREE.Group {
    const teamColor = building.team === 'player' ? this.playerTeamHex : this.enemyTeamHex;
    const visual = BuildingManager.createBuildingVisualModel(building.defId, undefined, teamColor);
    const center = building.getCenter();
    visual.position.set(center.x, 0, center.y);
    return visual;
  }

  public getGroup(): THREE.Group {
    return this.group;
  }

  public dispose(): void {
    for (const visual of this.buildingVisuals.values()) {
      visual.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    }
    for (const geom of this.geometries.values()) {
      geom.dispose();
    }
    this.geometries.clear();
    this.buildingVisuals.clear();
    this.buildings.clear();
    this.group.clear();
  }
}
