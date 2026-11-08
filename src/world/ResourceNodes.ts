import * as THREE from 'three';
import { MATCH_RULES } from '../data/matchRules';
import { NatureModels } from '../render/NatureModels';
import { PALETTE } from '../render/Palette';
import { Team, TilePos } from '../types';
import { GameMap, ResourceNodeData } from './MapConfig';

export interface ResourceNode {
  id: string;
  type: 'gold' | 'wood';
  team: Team;
  tile: TilePos;
  reserve: number;
  maxWorkers: number;
  assignedWorkers: Set<string>;
  depletedOrder: number;
  instanceIndex: number;
}

export class ResourceNodes {
  private nodes: ResourceNode[] = [];
  private group: THREE.Group;

  // Aktif ve tükenmiş InstancedMesh nesneleri (S10)
  private goldInstancedMesh: THREE.InstancedMesh | null = null;
  private woodInstancedMesh: THREE.InstancedMesh | null = null;
  private depletedGoldInstancedMesh: THREE.InstancedMesh | null = null;
  private depletedWoodInstancedMesh: THREE.InstancedMesh | null = null;

  private goldGeometry: THREE.BufferGeometry | null = null;
  private woodGeometry: THREE.BufferGeometry | null = null;
  private depletedGoldGeometry: THREE.BufferGeometry | null = null;
  private depletedWoodGeometry: THREE.BufferGeometry | null = null;

  private goldMaterial: THREE.Material | null = null;
  private woodMaterial: THREE.Material | null = null;
  private depletedGoldMaterial: THREE.Material | null = null;
  private depletedWoodMaterial: THREE.Material | null = null;

  // Yenilenme takibi [EK]
  private depletionCounter: number = 0;
  private renewTimers: Record<Team, Record<'gold' | 'wood', number | null>> = {
    player: { gold: null, wood: null },
    enemy: { gold: null, wood: null },
  };

  constructor(map: GameMap) {
    this.group = new THREE.Group();
    this.initNodes(map.nodes);
    this.buildMeshes();
  }

  private initNodes(nodeDataList: ResourceNodeData[]): void {
    let goldIdx = 0;
    let woodIdx = 0;

    for (const data of nodeDataList) {
      const isGold = data.type === 'gold';
      this.nodes.push({
        id: data.id,
        type: data.type,
        team: data.team,
        tile: { ...data.tile },
        reserve: MATCH_RULES.nodeReserve,
        maxWorkers: MATCH_RULES.nodeMaxWorkers,
        assignedWorkers: new Set(),
        depletedOrder: 0,
        instanceIndex: isGold ? goldIdx++ : woodIdx++,
      });
    }
  }

  private buildMeshes(): void {
    const goldNodes = this.nodes.filter((n) => n.type === 'gold');
    const woodNodes = this.nodes.filter((n) => n.type === 'wood');

    // S10: Altın noktası - Koyu kaya, parlak altın damarları/külçeler ve kazma
    if (goldNodes.length > 0) {
      this.goldGeometry = NatureModels.createGoldNodeGeometry();
      this.goldMaterial = new THREE.MeshLambertMaterial({
        color: PALETTE.goldVein,
        emissive: PALETTE.goldEmissive,
        emissiveIntensity: 0.22,
      });

      this.goldInstancedMesh = new THREE.InstancedMesh(
        this.goldGeometry,
        this.goldMaterial,
        goldNodes.length
      );
      this.goldInstancedMesh.castShadow = true;
      this.goldInstancedMesh.receiveShadow = true;
      this.goldInstancedMesh.frustumCulled = false;

      // S10: Tükenmiş altın kalıntısı (boş çukur ve kırık kaya)
      this.depletedGoldGeometry = NatureModels.createDepletedGoldGeometry();
      this.depletedGoldMaterial = new THREE.MeshLambertMaterial({
        color: PALETTE.goldOre,
      });
      this.depletedGoldInstancedMesh = new THREE.InstancedMesh(
        this.depletedGoldGeometry,
        this.depletedGoldMaterial,
        goldNodes.length
      );
      this.depletedGoldInstancedMesh.receiveShadow = true;
      this.depletedGoldInstancedMesh.frustumCulled = false;

      const dummy = new THREE.Object3D();
      for (const node of goldNodes) {
        dummy.position.set(node.tile.x + 0.5, 0.05, node.tile.y + 0.5);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        this.goldInstancedMesh.setMatrixAt(node.instanceIndex, dummy.matrix);

        // Başlangıçta kalıntı gizli
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        this.depletedGoldInstancedMesh.setMatrixAt(node.instanceIndex, dummy.matrix);
      }
      this.goldInstancedMesh.instanceMatrix.needsUpdate = true;
      this.depletedGoldInstancedMesh.instanceMatrix.needsUpdate = true;

      this.group.add(this.goldInstancedMesh);
      this.group.add(this.depletedGoldInstancedMesh);
    }

    // S10: Odun noktası - Kesilmiş kütük yığını ve yanında iki ağaç
    if (woodNodes.length > 0) {
      this.woodGeometry = NatureModels.createWoodNodeGeometry();
      this.woodMaterial = new THREE.MeshLambertMaterial({
        color: PALETTE.woodLog,
      });

      this.woodInstancedMesh = new THREE.InstancedMesh(
        this.woodGeometry,
        this.woodMaterial,
        woodNodes.length
      );
      this.woodInstancedMesh.castShadow = true;
      this.woodInstancedMesh.receiveShadow = true;
      this.woodInstancedMesh.frustumCulled = false;

      // S10: Tükenmiş odun kalıntısı (kesilmiş ağaç kütükleri)
      this.depletedWoodGeometry = NatureModels.createDepletedWoodGeometry();
      this.depletedWoodMaterial = new THREE.MeshLambertMaterial({
        color: PALETTE.woodBark,
      });
      this.depletedWoodInstancedMesh = new THREE.InstancedMesh(
        this.depletedWoodGeometry,
        this.depletedWoodMaterial,
        woodNodes.length
      );
      this.depletedWoodInstancedMesh.receiveShadow = true;
      this.depletedWoodInstancedMesh.frustumCulled = false;

      const dummy = new THREE.Object3D();
      for (const node of woodNodes) {
        dummy.position.set(node.tile.x + 0.5, 0.05, node.tile.y + 0.5);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        this.woodInstancedMesh.setMatrixAt(node.instanceIndex, dummy.matrix);

        // Başlangıçta kalıntı gizli
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        this.depletedWoodInstancedMesh.setMatrixAt(node.instanceIndex, dummy.matrix);
      }
      this.woodInstancedMesh.instanceMatrix.needsUpdate = true;
      this.depletedWoodInstancedMesh.instanceMatrix.needsUpdate = true;

      this.group.add(this.woodInstancedMesh);
      this.group.add(this.depletedWoodInstancedMesh);
    }
  }

  // Fonksiyonlar: getNodes(team, type)
  public getNodes(team: Team, type: 'gold' | 'wood'): ResourceNode[] {
    return this.nodes.filter((n) => n.team === team && n.type === type);
  }

  // findNearestFreeNode(team, type, fromTile) (boş = reserve > 0 ve atanmış işçi sayısı < nodeMaxWorkers)
  public findNearestFreeNode(
    team: Team,
    type: 'gold' | 'wood',
    fromTile: TilePos
  ): ResourceNode | null {
    const candidateNodes = this.nodes.filter(
      (n) =>
        n.team === team &&
        n.type === type &&
        n.reserve > 0 &&
        n.assignedWorkers.size < n.maxWorkers
    );

    if (candidateNodes.length === 0) return null;

    let nearestNode: ResourceNode | null = null;
    let shortestDist = Infinity;

    for (const node of candidateNodes) {
      const dist = Math.hypot(
        node.tile.x - fromTile.x,
        node.tile.y - fromTile.y
      );
      if (dist < shortestDist) {
        shortestDist = dist;
        nearestNode = node;
      }
    }

    return nearestNode;
  }

  // assignWorker(node, workerId)
  public assignWorker(node: ResourceNode, workerId: string): boolean {
    if (
      node.reserve > 0 &&
      node.assignedWorkers.size < node.maxWorkers &&
      !node.assignedWorkers.has(workerId)
    ) {
      node.assignedWorkers.add(workerId);
      return true;
    }
    return false;
  }

  // releaseWorker(node, workerId)
  public releaseWorker(node: ResourceNode, workerId: string): void {
    node.assignedWorkers.delete(workerId);
  }

  // SPEC S6: İşçinin bu noktadaki yuva indeksini (0 veya 1) döndürür
  public getWorkerSlotIndex(node: ResourceNode, workerId: string): number {
    const list = Array.from(node.assignedWorkers);
    const idx = list.indexOf(workerId);
    return idx >= 0 ? idx : 0;
  }

  // extract(node, amount) (gerçekte alınan miktarı döndürür; rezerv 0'ın altına inmez)
  public extract(node: ResourceNode, amount: number): number {
    if (node.reserve <= 0) return 0;

    const actual = Math.min(amount, node.reserve);
    node.reserve -= actual;

    if (node.reserve <= 0) {
      node.reserve = 0;
      node.depletedOrder = ++this.depletionCounter;
      // Tükenen nokta çizimden gizlenir
      this.updateMeshVisibility(node, false);
      node.assignedWorkers.clear();
    }

    return actual;
  }

  // Tükenen veya yeniden oluşan noktanın görsel durumunu güncelleme (S10)
  private updateMeshVisibility(node: ResourceNode, visible: boolean): void {
    const isGold = node.type === 'gold';
    const activeMesh = isGold ? this.goldInstancedMesh : this.woodInstancedMesh;
    const depletedMesh = isGold ? this.depletedGoldInstancedMesh : this.depletedWoodInstancedMesh;
    if (!activeMesh || !depletedMesh) return;

    const dummy = new THREE.Object3D();
    if (visible) {
      // Aktif kaynak modeli görünür, tükenmiş kalıntı gizli
      dummy.position.set(node.tile.x + 0.5, 0.05, node.tile.y + 0.5);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      activeMesh.setMatrixAt(node.instanceIndex, dummy.matrix);

      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      depletedMesh.setMatrixAt(node.instanceIndex, dummy.matrix);
    } else {
      // S10: Tükenen nokta görünür bir kalıntıya dönüşür (altın: boş çukur/kaya; odun: kütük)
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      activeMesh.setMatrixAt(node.instanceIndex, dummy.matrix);

      dummy.position.set(node.tile.x + 0.5, 0.05, node.tile.y + 0.5);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      depletedMesh.setMatrixAt(node.instanceIndex, dummy.matrix);
    }

    activeMesh.instanceMatrix.needsUpdate = true;
    depletedMesh.instanceMatrix.needsUpdate = true;
  }

  // SPEC S6 Yenilenme [EK]:
  // bir takımın bir türdeki TÜM noktalarının rezervi 0 olunca nodeRenewDelaySec sonra,
  // o takımın o türdeki ilk tükenen noktası aynı karede nodeReserve rezervle yeniden oluşur.
  public update(dt: number): void {
    const teams: Team[] = ['player', 'enemy'];
    const types: ('gold' | 'wood')[] = ['gold', 'wood'];

    for (const team of teams) {
      for (const type of types) {
        const teamNodes = this.getNodes(team, type);
        const allDepleted =
          teamNodes.length > 0 && teamNodes.every((n) => n.reserve <= 0);

        if (allDepleted) {
          if (this.renewTimers[team][type] === null) {
            this.renewTimers[team][type] = MATCH_RULES.nodeRenewDelaySec - dt;
          } else {
            this.renewTimers[team][type] = this.renewTimers[team][type]! - dt;
          }

          if (this.renewTimers[team][type]! <= 0) {
            // İlk tükenen noktayı bul (depletedOrder > 0 ve en küçük olan)
            const depletedNodes = teamNodes.filter((n) => n.reserve <= 0 && n.depletedOrder > 0);
            const candidateList = depletedNodes.length > 0 ? depletedNodes : teamNodes;
            const firstDepleted = candidateList.reduce((min, curr) =>
              curr.depletedOrder < min.depletedOrder ? curr : min
            );

            if (firstDepleted) {
              firstDepleted.reserve = MATCH_RULES.nodeReserve;
              firstDepleted.depletedOrder = 0;
              this.updateMeshVisibility(firstDepleted, true);
            }

            // Yenilenme gerçekleştikten sonra sayaç sıfırlanır
            this.renewTimers[team][type] = null;
          }
        } else {
          this.renewTimers[team][type] = null;
        }
      }
    }
  }

  public getGroup(): THREE.Group {
    return this.group;
  }

  public getAllNodes(): ResourceNode[] {
    return this.nodes;
  }

  public dispose(): void {
    if (this.goldGeometry) this.goldGeometry.dispose();
    if (this.woodGeometry) this.woodGeometry.dispose();
    if (this.depletedGoldGeometry) this.depletedGoldGeometry.dispose();
    if (this.depletedWoodGeometry) this.depletedWoodGeometry.dispose();

    if (this.goldMaterial) this.goldMaterial.dispose();
    if (this.woodMaterial) this.woodMaterial.dispose();
    if (this.depletedGoldMaterial) this.depletedGoldMaterial.dispose();
    if (this.depletedWoodMaterial) this.depletedWoodMaterial.dispose();

    if (this.goldInstancedMesh) this.goldInstancedMesh.dispose();
    if (this.woodInstancedMesh) this.woodInstancedMesh.dispose();
    if (this.depletedGoldInstancedMesh) this.depletedGoldInstancedMesh.dispose();
    if (this.depletedWoodInstancedMesh) this.depletedWoodInstancedMesh.dispose();

    this.group.clear();
  }
}
