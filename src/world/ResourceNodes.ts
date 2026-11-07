import * as THREE from 'three';
import { MATCH_RULES } from '../data/matchRules';
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

  private goldInstancedMesh: THREE.InstancedMesh | null = null;
  private woodInstancedMesh: THREE.InstancedMesh | null = null;

  private goldGeometry: THREE.BufferGeometry | null = null;
  private woodGeometry: THREE.BufferGeometry | null = null;
  private goldMaterial: THREE.Material | null = null;
  private woodMaterial: THREE.Material | null = null;

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

    // Altın noktası: küçük sarı kutu yığını (SPEC S6)
    if (goldNodes.length > 0) {
      const baseBox = new THREE.BoxGeometry(0.35, 0.22, 0.35);
      baseBox.translate(0, 0.11, 0);
      const topBox1 = new THREE.BoxGeometry(0.25, 0.18, 0.25);
      topBox1.translate(-0.1, 0.28, 0.05);
      const topBox2 = new THREE.BoxGeometry(0.2, 0.16, 0.2);
      topBox2.translate(0.1, 0.27, -0.05);

      this.goldGeometry = this.mergeGeometries([baseBox, topBox1, topBox2]);
      this.goldMaterial = new THREE.MeshLambertMaterial({ color: 0xf59e0b });

      this.goldInstancedMesh = new THREE.InstancedMesh(
        this.goldGeometry,
        this.goldMaterial,
        goldNodes.length
      );

      const dummy = new THREE.Object3D();
      for (const node of goldNodes) {
        dummy.position.set(node.tile.x + 0.5, 0.1, node.tile.y + 0.5);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        this.goldInstancedMesh.setMatrixAt(node.instanceIndex, dummy.matrix);
      }
      this.goldInstancedMesh.instanceMatrix.needsUpdate = true;
      this.group.add(this.goldInstancedMesh);
    }

    // Odun noktası: ağaç (SPEC S6)
    if (woodNodes.length > 0) {
      const trunk = new THREE.CylinderGeometry(0.14, 0.18, 0.5, 5);
      trunk.translate(0, 0.25, 0);
      const crown1 = new THREE.ConeGeometry(0.48, 0.8, 5);
      crown1.translate(0, 0.75, 0);
      const crown2 = new THREE.ConeGeometry(0.38, 0.65, 5);
      crown2.translate(0, 1.15, 0);

      this.woodGeometry = this.mergeGeometries([trunk, crown1, crown2]);
      this.woodMaterial = new THREE.MeshLambertMaterial({ color: 0x16a34a });

      this.woodInstancedMesh = new THREE.InstancedMesh(
        this.woodGeometry,
        this.woodMaterial,
        woodNodes.length
      );

      const dummy = new THREE.Object3D();
      for (const node of woodNodes) {
        dummy.position.set(node.tile.x + 0.5, 0, node.tile.y + 0.5);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        this.woodInstancedMesh.setMatrixAt(node.instanceIndex, dummy.matrix);
      }
      this.woodInstancedMesh.instanceMatrix.needsUpdate = true;
      this.group.add(this.woodInstancedMesh);
    }
  }

  private mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
    let totalVertices = 0;
    let totalNormals = 0;

    for (const g of geos) {
      totalVertices += g.attributes.position.array.length;
      if (g.attributes.normal) {
        totalNormals += g.attributes.normal.array.length;
      }
    }

    const posArray = new Float32Array(totalVertices);
    const normArray = new Float32Array(totalNormals);

    let posOffset = 0;
    let normOffset = 0;

    for (const g of geos) {
      const pos = g.attributes.position.array;
      posArray.set(pos, posOffset);
      posOffset += pos.length;

      if (g.attributes.normal) {
        const norm = g.attributes.normal.array;
        normArray.set(norm, normOffset);
        normOffset += norm.length;
      }
      g.dispose();
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    if (totalNormals > 0) {
      merged.setAttribute('normal', new THREE.BufferAttribute(normArray, 3));
    }
    return merged;
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

  // Tükenen veya yeniden oluşan noktanın görsel durumunu güncelleme
  private updateMeshVisibility(node: ResourceNode, visible: boolean): void {
    const mesh =
      node.type === 'gold' ? this.goldInstancedMesh : this.woodInstancedMesh;
    if (!mesh) return;

    const dummy = new THREE.Object3D();
    if (visible) {
      const yPos = node.type === 'gold' ? 0.1 : 0;
      dummy.position.set(node.tile.x + 0.5, yPos, node.tile.y + 0.5);
      dummy.scale.set(1, 1, 1);
    } else {
      dummy.position.set(node.tile.x + 0.5, -100, node.tile.y + 0.5);
      dummy.scale.set(0, 0, 0);
    }
    dummy.updateMatrix();
    mesh.setMatrixAt(node.instanceIndex, dummy.matrix);
    mesh.instanceMatrix.needsUpdate = true;
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
    if (this.goldMaterial) this.goldMaterial.dispose();
    if (this.woodMaterial) this.woodMaterial.dispose();
    this.group.clear();
  }
}
