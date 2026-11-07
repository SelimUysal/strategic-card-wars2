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
    private eventManager?: EventManager
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

  public registerWorker(unit: Unit): void {
    if (this.workers.has(unit.id)) return;

    const type: 'gold' | 'wood' = unit.defId === 'altin_madencisi' ? 'gold' : 'wood';
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

  // SPEC S2: Otomatik toplama, yürüyüş ve yenilenme atamaları
  public update(dt: number): void {
    this.reassignTimer += dt;
    const shouldCheckReassign = this.reassignTimer >= this.REASSIGN_INTERVAL_SEC;
    if (shouldCheckReassign) {
      this.reassignTimer = 0;
    }

    const deadWorkers: string[] = [];

    for (const [id, state] of this.workers.entries()) {
      const unit = state.unit;

      // Ölü kontrolü
      if (unit.state === 'dead' || unit.hp <= 0) {
        deadWorkers.push(id);
        continue;
      }

      // Atanmış nokta kontrolü
      let node: ResourceNode | null = null;
      if (state.assignedNodeId) {
        node = this.findNodeById(state.assignedNodeId);
        // Nokta tükenmişse atamayı boşa çıkar
        if (!node || node.reserve <= 0) {
          if (node) {
            this.resourceNodes.releaseWorker(node, unit.id);
          }
          state.assignedNodeId = null;
          state.gatherAccumulator = 0;
          node = null;
        }
      }

      // Atanmış noktası yoksa en yakın boş noktayı ara
      if (!node) {
        this.assignWorkerToNode(state);
        node = state.assignedNodeId ? this.findNodeById(state.assignedNodeId) : null;
      }

      // Hâlâ boş nokta yoksa beklemede kal
      if (!node) {
        if (unit.state === 'gathering') {
          unit.state = 'idle';
        }
        continue;
      }

      // SPEC S6: İşçiler aynı noktada farklı yanlarda durur (her işçi atandığı yuva için farklı yaklaşma karesi alır)
      const approachTile = this.getApproachTileForWorker(node, unit.id);
      const isAtApproachTile =
        Math.floor(unit.pos.x) === approachTile.x && Math.floor(unit.pos.y) === approachTile.y;

      // Alternatif: eğer hedefe 1 mesafe yakınsa ve yaklaşma karesi ulaşılamıyorsa
      const ux = Math.floor(unit.pos.x);
      const uy = Math.floor(unit.pos.y);
      const distToNode = Math.max(Math.abs(ux - node.tile.x), Math.abs(uy - node.tile.y));

      if (isAtApproachTile || (distToNode <= 1 && unit.state === 'gathering')) {
        // Noktaya ulaşıldı: toplama moduna geç
        unit.state = 'gathering';
        unit.rotationY = Math.atan2(node.tile.x + 0.5 - unit.pos.x, node.tile.y + 0.5 - unit.pos.y);

        // SPEC S2: Saniyede MATCH_RULES.gatherPerSecPerWorker x UnitStats.getGatherMult(team) kaynak çıkarılır
        const mult = this.modifierRegistry
          ? this.modifierRegistry.getGatherMult(unit.team)
          : 1;
        const rate = MATCH_RULES.gatherPerSecPerWorker * mult;
        state.gatherAccumulator += rate * dt;

        if (state.gatherAccumulator >= 1) {
          const extractAmount = Math.floor(state.gatherAccumulator);
          const actualExtracted = this.resourceNodes.extract(node, extractAmount);

          if (actualExtracted > 0) {
            // SPEC S2: Doğrudan takımın stoğuna eklenir (taşıma yürüyüşü yok) [EK]
            this.resourceManager.add(unit.team, state.type, actualExtracted, true);
          }

          state.gatherAccumulator -= extractAmount;

          // Nokta bu çıkarma ile tükendiyse
          if (node.reserve <= 0) {
            state.assignedNodeId = null;
            state.gatherAccumulator = 0;
            this.assignWorkerToNode(state);
          }
        }
      } else {
        // Henüz yaklaşma karesinde değil: yol bul ve yaklaşma karesine yürü
        if (unit.state !== 'moving') {
          const path = this.pathfinding.findPath(
            { x: ux, y: uy },
            approachTile
          );

          if (path && path.length > 0) {
            unit.setPath(path);
          } else if (distToNode <= 1) {
            // Yanındaysa doğrudan toplamaya başla
            unit.state = 'gathering';
          } else {
            // Yürünemiyorsa atamayı serbest bırak ve boşta bekle
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

    // Karşıt yön çiftleri (örneğin Batı/Doğu veya Kuzey/Güney)
    const sidesPair1: [TilePos, TilePos] = [
      { x: node.tile.x - 1, y: node.tile.y }, // Batı
      { x: node.tile.x + 1, y: node.tile.y }, // Doğu
    ];
    const sidesPair2: [TilePos, TilePos] = [
      { x: node.tile.x, y: node.tile.y - 1 }, // Kuzey
      { x: node.tile.x, y: node.tile.y + 1 }, // Güney
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

    // Yürünebilir komşulardan birini al
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
