import { BuildingManager } from '../buildings/BuildingManager';
import { EventManager } from '../core/EventManager';
import { MATCH_RULES } from '../data/matchRules';
import { Team, TilePos, UnitId } from '../types';
import { Unit } from '../units/Unit';
import { UnitManager } from '../units/UnitManager';
import { ModifierRegistry } from '../units/UnitStats';
import { GameMap } from '../world/MapConfig';
import { Pathfinding } from '../world/Pathfinding';
import { ResourceNode, ResourceNodes } from '../world/ResourceNodes';
import { ResourceManager } from './ResourceManager';

interface WorkerState {
  unit: Unit;
  type: 'gold' | 'wood';
  assignedNodeId: string | null;
  gatherAccumulator: number;
}

export class WorkerManager {
  private workers: Map<string, WorkerState> = new Map();
  private queuedWorkerCountProvider: ((team: Team, type: UnitId) => number) | null = null;
  private reassignTimer: number = 0;
  private readonly REASSIGN_INTERVAL_SEC: number = 1.0;

  constructor(
    private map: GameMap,
    private pathfinding: Pathfinding,
    private resourceNodes: ResourceNodes,
    private resourceManager: ResourceManager,
    private unitManager: UnitManager,
    private modifierRegistry?: ModifierRegistry,
    private eventManager?: EventManager,
    private buildingManager?: BuildingManager
  ) {
    if (this.unitManager.setPathfinding) {
      this.unitManager.setPathfinding(this.pathfinding);
    }

    if (this.eventManager) {
      // SPEC S2: Adım 8'de üretilen yeni işçi, 'unitSpawned' olayıyla otomatik atanır
      this.eventManager.on('unitSpawned', ({ unit }: { unit: Unit }) => {
        if (unit.defId === 'altin_madencisi' || unit.defId === 'oduncu') {
          this.registerWorker(unit);
        }
      });

      // SPEC S2: İşçiler ölünce atama serbest kalır
      this.eventManager.on('unitDied', ({ unit }: { unit: Unit }) => {
        this.unregisterWorker(unit.id);
      });
    }
  }

  public setBuildingManager(bm: BuildingManager): void {
    this.buildingManager = bm;
  }

  // SPEC S2: maç başında her takım için MATCH_RULES.startWorkers kadar işçi (1 altın madencisi, 1 oduncu)
  // ana karargâhın yanında doğar; nüfus 2 / 60 olur.
  public initStartWorkers(): void {
    const teams: Team[] = ['player', 'enemy'];

    for (const team of teams) {
      const hqStart = team === 'player' ? this.map.playerStart : this.map.enemyStart;

      // Ana karargâhın (6x6) yanında yürünebilir kareler bul
      const spawnTile1 = this.findSpawnTileNearHq(hqStart, 0);
      const spawnTile2 = this.findSpawnTileNearHq(hqStart, 1);

      // 1 altın madencisi, 1 oduncu doğur
      const goldWorker = this.unitManager.spawnUnit('altin_madencisi', team, {
        x: spawnTile1.x + 0.5,
        y: spawnTile1.y + 0.5,
      });
      const woodWorker = this.unitManager.spawnUnit('oduncu', team, {
        x: spawnTile2.x + 0.5,
        y: spawnTile2.y + 0.5,
      });

      this.registerWorker(goldWorker);
      this.registerWorker(woodWorker);
    }
  }

  private findSpawnTileNearHq(hqStart: TilePos, index: number): TilePos {
    // HQ 6x6 footprint: hqStart.x..+6, hqStart.y..+6
    // Çevresindeki aday kareler
    const candidates: TilePos[] = [
      { x: hqStart.x + 6, y: hqStart.y + 2 },
      { x: hqStart.x + 6, y: hqStart.y + 3 },
      { x: hqStart.x + 6, y: hqStart.y + 4 },
      { x: hqStart.x + 2, y: hqStart.y + 6 },
      { x: hqStart.x + 3, y: hqStart.y + 6 },
      { x: hqStart.x - 1, y: hqStart.y + 2 },
      { x: hqStart.x - 1, y: hqStart.y + 3 },
    ];

    const target = candidates[index % candidates.length];
    const walkable = this.pathfinding.findNearestWalkableTile(target);
    return walkable ? walkable : { x: hqStart.x + 6, y: hqStart.y + 2 };
  }

  private findHqEdgeTile(team: Team, fromTile: TilePos): TilePos {
    let hqPos: TilePos = team === 'player' ? this.map.playerStart : this.map.enemyStart;
    let width = 6;
    let height = 6;

    if (this.buildingManager) {
      const hq = this.buildingManager.getHq(team);
      if (hq && hq.state !== 'destroyed') {
        const rect = hq.getRect();
        hqPos = { x: rect.x, y: rect.y };
        width = rect.w;
        height = rect.h;
      }
    }

    const perimeter: TilePos[] = [];
    for (let x = hqPos.x - 1; x <= hqPos.x + width; x++) {
      perimeter.push({ x, y: hqPos.y - 1 });
      perimeter.push({ x, y: hqPos.y + height });
    }
    for (let y = hqPos.y; y < hqPos.y + height; y++) {
      perimeter.push({ x: hqPos.x - 1, y });
      perimeter.push({ x: hqPos.x + width, y });
    }

    const walkablePerimeter = perimeter.filter(p => this.pathfinding.isWalkable(p.x, p.y));
    if (walkablePerimeter.length === 0) {
      const fallback = this.pathfinding.findNearestWalkableTile({
        x: hqPos.x + Math.floor(width / 2),
        y: hqPos.y + Math.floor(height / 2),
      });
      return fallback || hqPos;
    }

    let best = walkablePerimeter[0];
    let minDistSq = Infinity;
    for (const p of walkablePerimeter) {
      const distSq = (p.x - fromTile.x) ** 2 + (p.y - fromTile.y) ** 2;
      if (distSq < minDistSq) {
        minDistSq = distSq;
        best = p;
      }
    }

    return best;
  }

  public registerWorker(unit: Unit): void {
    if (this.workers.has(unit.id)) return;

    const type: 'gold' | 'wood' = unit.defId === 'altin_madencisi' ? 'gold' : 'wood';
    unit.carriedType = type;
    unit.carriedAmount = 0;
    unit.workerState = 'toNode';

    const state: WorkerState = {
      unit,
      type,
      assignedNodeId: null,
      gatherAccumulator: 0,
    };

    this.workers.set(unit.id, state);
    this.assignWorkerToNode(state);
  }

  public unregisterWorker(workerId: string): void {
    const state = this.workers.get(workerId);
    if (!state) return;

    // SPEC S4: İşçi ölünce taşıdığı yük yok olur
    if (state.unit) {
      state.unit.carriedAmount = 0;
      state.unit.carriedType = null;
      state.unit.workerState = 'toNode';
    }

    if (state.assignedNodeId) {
      const node = this.findNodeById(state.assignedNodeId);
      if (node) {
        this.resourceNodes.releaseWorker(node, workerId);
      }
    }

    this.workers.delete(workerId);
  }

  // SPEC S2: canAddWorker(team, type): mevcut işçi + kuyruktaki işçi < üst sınır
  public canAddWorker(team: Team, type: UnitId): boolean {
    const currentCount = this.getWorkerCount(team, type);
    const queuedCount = this.queuedWorkerCountProvider
      ? this.queuedWorkerCountProvider(team, type)
      : 0;

    const limit =
      type === 'altin_madencisi'
        ? MATCH_RULES.maxWorkers.altin_madencisi
        : type === 'oduncu'
        ? MATCH_RULES.maxWorkers.oduncu
        : 8;

    return currentCount + queuedCount < limit;
  }

  // SPEC S2: setQueuedWorkerCountProvider(fonksiyon) ile Adım 8'den verilir [EK]
  public setQueuedWorkerCountProvider(
    provider: (team: Team, type: UnitId) => number
  ): void {
    this.queuedWorkerCountProvider = provider;
  }

  public getWorkerCount(team: Team, type: UnitId): number {
    let count = 0;
    for (const w of this.workers.values()) {
      if (w.unit.team === team && w.unit.defId === type && w.unit.state !== 'dead') {
        count++;
      }
    }
    return count;
  }

  // SPEC S2, S3, S4, S5: 4 aşamalı işçi döngüsü: toNode -> gathering -> returning -> depositing
  public update(dt: number): void {
    this.reassignTimer += dt;
    const shouldCheckReassign = this.reassignTimer >= this.REASSIGN_INTERVAL_SEC;
    if (shouldCheckReassign) {
      this.reassignTimer = 0;
    }

    const deadWorkers: string[] = [];

    for (const [id, state] of this.workers.entries()) {
      const unit = state.unit;

      // SPEC S4: Ölü kontrolü - yük yok olur
      if (unit.state === 'dead' || unit.hp <= 0) {
        unit.carriedAmount = 0;
        unit.carriedType = null;
        deadWorkers.push(id);
        continue;
      }

      const workerTile = {
        x: Math.floor(unit.pos.x),
        y: Math.floor(unit.pos.y),
      };

      if (!unit.workerState) {
        unit.workerState = 'toNode';
      }

      // FAZ: RETURNING (HQ'ya yürüme)
      if (unit.workerState === 'returning') {
        const hqEdge = this.findHqEdgeTile(unit.team, workerTile);
        const distToHqEdge = Math.max(
          Math.abs(workerTile.x - hqEdge.x),
          Math.abs(workerTile.y - hqEdge.y)
        );

        if (distToHqEdge <= 1 || (workerTile.x === hqEdge.x && workerTile.y === hqEdge.y)) {
          unit.workerState = 'depositing';
        } else {
          if (unit.state !== 'moving') {
            const path = this.pathfinding.findPath(workerTile, hqEdge);
            if (path && path.length > 0) {
              unit.setPath(path);
            } else {
              // SPEC S4: Karargâha giden yol kapalıysa işçi durur (idle)
              unit.state = 'idle';
            }
          }
          continue;
        }
      }

      // FAZ: DEPOSITING (Stoğa ekleme ve istatistik)
      if (unit.workerState === 'depositing') {
        // SPEC S2 & S5: Kaynak YALNIZCA teslim anında stoğa ve 'toplanan' istatistiğine eklenir
        if (unit.carriedAmount > 0 && unit.carriedType) {
          this.resourceManager.add(unit.team, unit.carriedType, unit.carriedAmount, true);
          unit.carriedAmount = 0;
        }

        state.gatherAccumulator = 0;
        unit.workerState = 'toNode';

        let node: ResourceNode | null = state.assignedNodeId
          ? this.findNodeById(state.assignedNodeId)
          : null;
        if (!node || node.reserve <= 0) {
          if (node) {
            this.resourceNodes.releaseWorker(node, unit.id);
          }
          state.assignedNodeId = null;
          this.assignWorkerToNode(state);
        }
      }

      // FAZ: TO_NODE & GATHERING
      let node: ResourceNode | null = null;
      if (state.assignedNodeId) {
        node = this.findNodeById(state.assignedNodeId);
        if (!node || node.reserve <= 0) {
          if (node) {
            this.resourceNodes.releaseWorker(node, unit.id);
          }
          state.assignedNodeId = null;
          node = null;
        }
      }

      // Atanmış noktası yoksa veya bittiyse
      if (!node) {
        // SPEC S3: Üzerinde henüz teslim edilmemiş yük varsa ÖNCE HQ'ya git
        if (unit.carriedAmount > 0) {
          unit.workerState = 'returning';
          continue;
        } else {
          this.assignWorkerToNode(state);
          node = state.assignedNodeId ? this.findNodeById(state.assignedNodeId) : null;
        }
      }

      // Hâlâ nokta yoksa
      if (!node) {
        if (unit.carriedAmount > 0) {
          unit.workerState = 'returning';
        } else {
          unit.workerState = 'toNode';
          if (unit.state === 'gathering') {
            unit.state = 'idle';
          }
        }
        continue;
      }

      const approachTile = this.getApproachTileForWorker(node, unit.id);
      const isAtApproachTile =
        workerTile.x === approachTile.x && workerTile.y === approachTile.y;
      const distToNode = Math.max(
        Math.abs(workerTile.x - node.tile.x),
        Math.abs(workerTile.y - node.tile.y)
      );

      if (isAtApproachTile || (distToNode <= 1 && unit.workerState === 'gathering')) {
        // Noktaya ulaşıldı: GATHERING
        unit.workerState = 'gathering';
        unit.state = 'gathering';
        unit.rotationY = Math.atan2(
          node.tile.x + 0.5 - unit.pos.x,
          node.tile.y + 0.5 - unit.pos.y
        );

        // SPEC S1 & S5: gatherPerSecPerWorker (3) x gatherRate çarpanı
        const mult = this.modifierRegistry
          ? this.modifierRegistry.getGatherMult(unit.team)
          : 1;
        const rate = MATCH_RULES.gatherPerSecPerWorker * mult;
        state.gatherAccumulator += rate * dt;

        if (state.gatherAccumulator >= 1) {
          const wantExtract = Math.floor(state.gatherAccumulator);
          const spaceLeft = MATCH_RULES.workerCarryCapacity - unit.carriedAmount;
          const extractAmount = Math.min(wantExtract, spaceLeft);

          if (spaceLeft > 0) {
            const actualExtracted = this.resourceNodes.extract(node, extractAmount);
            if (actualExtracted > 0) {
              unit.carriedAmount += actualExtracted;
              unit.carriedType = state.type;
            }
          }

          state.gatherAccumulator -= wantExtract;

          // SPEC S2 & S3: Kapasite (30) doldu mu veya nokta bitti mi? HQ'ya dön!
          if (unit.carriedAmount >= MATCH_RULES.workerCarryCapacity || node.reserve <= 0) {
            unit.workerState = 'returning';
            if (node.reserve <= 0) {
              this.resourceNodes.releaseWorker(node, unit.id);
              state.assignedNodeId = null;
            }
          }
        }
      } else {
        // Henüz nokta yanında değil: toNode yürü
        unit.workerState = 'toNode';
        if (unit.state !== 'moving') {
          const path = this.pathfinding.findPath(workerTile, approachTile);
          if (path && path.length > 0) {
            unit.setPath(path);
          } else if (distToNode <= 1) {
            unit.workerState = 'gathering';
            unit.state = 'gathering';
          } else {
            this.resourceNodes.releaseWorker(node, unit.id);
            state.assignedNodeId = null;
            unit.state = 'idle';
          }
        }
      }
    }

    for (const id of deadWorkers) {
      this.unregisterWorker(id);
    }
  }

  // SPEC S6: Her işçi atandığı yuva için farklı bir yaklaşma karesi alır [EK]
  private getApproachTileForWorker(node: ResourceNode, workerId: string): TilePos {
    const slotIdx = this.resourceNodes.getWorkerSlotIndex(node, workerId);

    const sidesPair1: [TilePos, TilePos] = [
      { x: node.tile.x - 1, y: node.tile.y },
      { x: node.tile.x + 1, y: node.tile.y },
    ];
    const sidesPair2: [TilePos, TilePos] = [
      { x: node.tile.x, y: node.tile.y - 1 },
      { x: node.tile.x, y: node.tile.y + 1 },
    ];

    if (
      this.pathfinding.isWalkable(sidesPair1[0].x, sidesPair1[0].y) &&
      this.pathfinding.isWalkable(sidesPair1[1].x, sidesPair1[1].y)
    ) {
      return slotIdx === 0 ? sidesPair1[0] : sidesPair1[1];
    }

    if (
      this.pathfinding.isWalkable(sidesPair2[0].x, sidesPair2[0].y) &&
      this.pathfinding.isWalkable(sidesPair2[1].x, sidesPair2[1].y)
    ) {
      return slotIdx === 0 ? sidesPair2[0] : sidesPair2[1];
    }

    const allNeighbors: TilePos[] = [
      sidesPair1[0], sidesPair1[1], sidesPair2[0], sidesPair2[1],
      { x: node.tile.x - 1, y: node.tile.y - 1 },
      { x: node.tile.x + 1, y: node.tile.y + 1 },
      { x: node.tile.x - 1, y: node.tile.y + 1 },
      { x: node.tile.x + 1, y: node.tile.y - 1 },
    ];
    const walkable = allNeighbors.filter((p) => this.pathfinding.isWalkable(p.x, p.y));
    if (walkable.length > 0) {
      return walkable[slotIdx % walkable.length];
    }

    return node.tile;
  }

  private assignWorkerToNode(state: WorkerState): void {
    const workerTile = {
      x: Math.floor(state.unit.pos.x),
      y: Math.floor(state.unit.pos.y),
    };

    const node = this.resourceNodes.findNearestFreeNode(
      state.unit.team,
      state.type,
      workerTile
    );

    if (node) {
      const assigned = this.resourceNodes.assignWorker(node, state.unit.id);
      if (assigned) {
        state.assignedNodeId = node.id;
        state.gatherAccumulator = 0;

        const approachTile = this.getApproachTileForWorker(node, state.unit.id);
        const path = this.pathfinding.findPath(workerTile, approachTile);
        if (path && path.length > 0) {
          state.unit.setPath(path);
        }
      }
    } else {
      state.assignedNodeId = null;
      state.unit.state = 'idle';
    }
  }

  private findNodeById(nodeId: string): ResourceNode | null {
    const all = this.resourceNodes.getAllNodes();
    for (const n of all) {
      if (n.id === nodeId) return n;
    }
    return null;
  }
}

