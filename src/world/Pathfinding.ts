import { MATCH_RULES } from '../data/matchRules';
import { TilePos } from '../types';
import { GameMap } from './MapConfig';

// A* düğüm yapısı
interface PathNode {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: PathNode | null;
}

// SPEC S2: Yol arama istek yapısı
export interface PathRequest {
  id: string;
  start: TilePos;
  type: 'point' | 'rect';
  goal?: TilePos;
  rect?: { x: number; y: number; w: number; h: number };
  range?: number;
  returnClosestOnFail?: boolean;
  age: number; // Simülasyon bekleme süresi (saniye)
  callback: (path: TilePos[] | null) => void;
}

export class Pathfinding {
  private width: number;
  private height: number;
  private dynamicBlocked: Uint16Array;
  private requestQueue: PathRequest[] = [];
  private readonly BASE_BATCH_SIZE: number = 10;


  // Çapraz hareket maliyeti (kök 2) ve düz hareket maliyeti (1)
  private readonly COST_ORTHOGONAL = 1;
  private readonly COST_DIAGONAL = Math.SQRT2;

  constructor(private map: GameMap) {
    this.width = map.width;
    this.height = map.height;
    this.dynamicBlocked = new Uint16Array(this.width * this.height);

    // SPEC S1: Kaynak noktası kareleri yürünemez olarak işaretlenir
    for (const node of map.nodes) {
      this.blockTile(node.tile.x, node.tile.y);
    }
  }

  public isWalkable(x: number, y: number): boolean {
    if (!this.map.inBounds(x, y)) return false;
    // SPEC S1: Yürünebilir: flat, forest, passage. Yürünemez: blocked, bina ve kaynak noktaları
    const mapWalkable = this.map.isWalkable(x, y);
    const notDynamicBlocked = this.dynamicBlocked[y * this.width + x] === 0;
    return mapWalkable && notDynamicBlocked;
  }

  public blockTile(x: number, y: number): void {
    if (this.map.inBounds(x, y)) {
      this.dynamicBlocked[y * this.width + x]++;
    }
  }

  public unblockTile(x: number, y: number): void {
    if (this.map.inBounds(x, y)) {
      const idx = y * this.width + x;
      if (this.dynamicBlocked[idx] > 0) {
        this.dynamicBlocked[idx]--;
      }
    }
  }

  // SPEC S2: blockRect ve unblockRect (bina kurulunca ve yıkılınca)
  public blockRect(rect: { x: number; y: number; w: number; h: number }): void {
    for (let ry = 0; ry < rect.h; ry++) {
      for (let rx = 0; rx < rect.w; rx++) {
        this.blockTile(rect.x + rx, rect.y + ry);
      }
    }
  }

  public unblockRect(rect: { x: number; y: number; w: number; h: number }): void {
    for (let ry = 0; ry < rect.h; ry++) {
      for (let rx = 0; rx < rect.w; rx++) {
        this.unblockTile(rect.x + rx, rect.y + ry);
      }
    }
  }

  // SPEC S2: Hedef kare yürünemezse en yakın yürünebilir kare hedef alınır
  public findNearestWalkableTile(target: TilePos, maxRadius: number = 20): TilePos | null {
    if (this.isWalkable(target.x, target.y)) {
      return { ...target };
    }

    let nearest: TilePos | null = null;
    let shortestDistSq = Infinity;

    for (let r = 1; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = target.x + dx;
          const ty = target.y + dy;
          if (this.isWalkable(tx, ty)) {
            const distSq = dx * dx + dy * dy;
            if (distSq < shortestDistSq) {
              shortestDistSq = distSq;
              nearest = { x: tx, y: ty };
            }
          }
        }
      }
      if (nearest !== null) return nearest;
    }

    return null;
  }

  // SPEC S2: Kuyruğa istek ekle (FIFO ve yaşlanma; var olan isteğin yaşı korunur)
  public requestPath(req: Omit<PathRequest, 'age'>): void {
    const existing = this.requestQueue.find((r) => r.id === req.id);
    if (existing) {
      existing.start = req.start;
      existing.type = req.type;
      existing.goal = req.goal;
      existing.rect = req.rect;
      existing.range = req.range;
      existing.returnClosestOnFail = req.returnClosestOnFail;
      existing.callback = req.callback;
    } else {
      this.requestQueue.push({ ...req, age: 0 });
    }
  }

  public cancelRequest(id: string): void {
    this.requestQueue = this.requestQueue.filter((r) => r.id !== id);
  }

  // SPEC S2: Her simülasyon adımında yol arama kuyruğunu FIFO + yaşlanma garantisiyle işle
  public update(dt: number): void {
    if (this.requestQueue.length === 0) return;

    for (const req of this.requestQueue) {
      req.age += dt;
    }

    // Yaşa göre azalan sırala (en yaşlı istekler en önde)
    this.requestQueue.sort((a, b) => b.age - a.age);

    const maxWait = MATCH_RULES.maxPathWaitSec; // 1.0 saniye
    const urgentCount = this.requestQueue.filter((r) => r.age >= maxWait).length;
    // Bekleme süresi 1 saniyeyi aşan tüm istekler bu adımda kesin işlenir; en az 10 istek işlenir
    const processCount = Math.min(this.requestQueue.length, Math.max(this.BASE_BATCH_SIZE, urgentCount));

    const batch = this.requestQueue.splice(0, processCount);
    for (const req of batch) {
      let path: TilePos[] | null = null;
      if (req.type === 'rect' && req.rect) {
        path = this.findPathToRect(req.start, req.rect, req.range || 1, req.returnClosestOnFail);
      } else if (req.goal) {
        path = this.findPath(req.start, req.goal, req.returnClosestOnFail);
      }
      req.callback(path);
    }
  }

  // SPEC S1 & S2 & S3: A* ile findPath(start, goal)
  public findPath(
    start: TilePos,
    goal: TilePos,
    returnClosestOnFail: boolean = false
  ): TilePos[] | null {
    if (!this.map.inBounds(start.x, start.y)) return null;

    // Başlangıç karesi bina veya engelle yürünemez hale geldiyse en yakın yürünebilir kareye uyarla
    let adjustedStart = start;
    if (!this.isWalkable(start.x, start.y)) {
      const nearestStart = this.findNearestWalkableTile(start, 5);
      if (nearestStart) {
        adjustedStart = nearestStart;
      }
    }

    // Hedef yürünemezse en yakın yürünebilir kareyi hedef al
    let adjustedGoal = goal;
    if (!this.isWalkable(goal.x, goal.y)) {
      const nearest = this.findNearestWalkableTile(goal);
      if (!nearest) {
        if (returnClosestOnFail) {
          adjustedGoal = goal;
        } else {
          return null;
        }
      } else {
        adjustedGoal = nearest;
      }
    }

    if (adjustedStart.x === adjustedGoal.x && adjustedStart.y === adjustedGoal.y) {
      return [{ x: adjustedStart.x, y: adjustedStart.y }];
    }

    return this.runAStar(
      adjustedStart,
      (x, y) => x === adjustedGoal.x && y === adjustedGoal.y,
      (x, y) => this.heuristic(x, y, adjustedGoal.x, adjustedGoal.y),
      returnClosestOnFail
    );
  }

  // SPEC S2 & S3: findPathToRect(start, rect, range)
  // rect'in en yakın kenarına uzaklığı <= range olan ilk yürünebilir kareye giden yol
  public findPathToRect(
    start: TilePos,
    rect: { x: number; y: number; w: number; h: number },
    range: number,
    returnClosestOnFail: boolean = false
  ): TilePos[] | null {
    if (!this.map.inBounds(start.x, start.y)) return null;

    let adjustedStart = start;
    if (!this.isWalkable(start.x, start.y)) {
      const nearestStart = this.findNearestWalkableTile(start, 5);
      if (nearestStart) {
        adjustedStart = nearestStart;
      }
    }

    const isInsideRange = (x: number, y: number): boolean => {
      const dist = this.distanceToRect(x, y, rect);
      return dist <= range;
    };

    // Zaten menzil içindeyse
    if (isInsideRange(adjustedStart.x, adjustedStart.y)) {
      return [{ x: adjustedStart.x, y: adjustedStart.y }];
    }

    return this.runAStar(
      adjustedStart,
      (x, y) => isInsideRange(x, y),
      (x, y) => this.distanceToRect(x, y, rect),
      returnClosestOnFail
    );
  }

  // SPEC S3: Hedefe doğrudan yol yoksa ulaşılabilir en yakın kareye ilerleme yolu
  public findNearestReachablePathTowards(start: TilePos, target: TilePos): TilePos[] | null {
    return this.findPath(start, target, true);
  }

  // SPEC S2: isReachable(start, goal)
  public isReachable(start: TilePos, goal: TilePos): boolean {
    return this.findPath(start, goal) !== null;
  }

  // A* algoritması çekirdeği (returnClosestOnFail ile tam hedefe ulaşılamazsa en yakın düğümü döndürür)
  private runAStar(
    start: TilePos,
    isGoal: (x: number, y: number) => boolean,
    heuristicFn: (x: number, y: number) => number,
    returnClosestOnFail: boolean = false
  ): TilePos[] | null {
    const openSet: PathNode[] = [];
    const closedSet = new Uint8Array(this.width * this.height);
    const nodeMap: Map<number, PathNode> = new Map();

    const startIdx = start.y * this.width + start.x;
    const startNode: PathNode = {
      x: start.x,
      y: start.y,
      g: 0,
      h: heuristicFn(start.x, start.y),
      f: heuristicFn(start.x, start.y),
      parent: null,
    };

    openSet.push(startNode);
    nodeMap.set(startIdx, startNode);
    let bestNode: PathNode = startNode;

    // Yönler (8 yön: 4 dik, 4 çapraz)
    const dirs = [
      { dx: 1, dy: 0, diag: false, cost: this.COST_ORTHOGONAL },
      { dx: -1, dy: 0, diag: false, cost: this.COST_ORTHOGONAL },
      { dx: 0, dy: 1, diag: false, cost: this.COST_ORTHOGONAL },
      { dx: 0, dy: -1, diag: false, cost: this.COST_ORTHOGONAL },
      { dx: 1, dy: 1, diag: true, cost: this.COST_DIAGONAL },
      { dx: 1, dy: -1, diag: true, cost: this.COST_DIAGONAL },
      { dx: -1, dy: 1, diag: true, cost: this.COST_DIAGONAL },
      { dx: -1, dy: -1, diag: true, cost: this.COST_DIAGONAL },
    ];

    while (openSet.length > 0) {
      // En düşük f değerine sahip düğümü seç (min heap yerine basit sıralama)
      let lowestIdx = 0;
      for (let i = 1; i < openSet.length; i++) {
        if (openSet[i].f < openSet[lowestIdx].f) {
          lowestIdx = i;
        }
      }

      const current = openSet.splice(lowestIdx, 1)[0];
      const currentIdx = current.y * this.width + current.x;
      closedSet[currentIdx] = 1;

      if (current.h < bestNode.h) {
        bestNode = current;
      }

      // Hedefe ulaşıldı mı?
      if (isGoal(current.x, current.y)) {
        return this.reconstructPath(current);
      }

      // Komşuları gez
      for (const dir of dirs) {
        const nx = current.x + dir.dx;
        const ny = current.y + dir.dy;
        const nIdx = ny * this.width + nx;

        if (!this.map.inBounds(nx, ny) || closedSet[nIdx] === 1) {
          continue;
        }

        // Komşunun yürünebilirliği
        if (!this.isWalkable(nx, ny)) {
          continue;
        }

        // SPEC S1: Çapraz hareket yürünemez bir köşeyi KESMEZ
        if (dir.diag) {
          const adj1Walkable = this.isWalkable(current.x + dir.dx, current.y);
          const adj2Walkable = this.isWalkable(current.x, current.y + dir.dy);
          if (!adj1Walkable || !adj2Walkable) {
            continue;
          }
        }

        const tentativeG = current.g + dir.cost;
        let neighbor = nodeMap.get(nIdx);

        if (!neighbor) {
          neighbor = {
            x: nx,
            y: ny,
            g: tentativeG,
            h: heuristicFn(nx, ny),
            f: tentativeG + heuristicFn(nx, ny),
            parent: current,
          };
          nodeMap.set(nIdx, neighbor);
          openSet.push(neighbor);
        } else if (tentativeG < neighbor.g) {
          neighbor.parent = current;
          neighbor.g = tentativeG;
          neighbor.f = tentativeG + neighbor.h;
        }
      }
    }

    // SPEC S3: Hedefe doğrudan yol yoksa ve kısmi yol isteniyorsa en yakın yürünebilir düğüme yol ver
    if (returnClosestOnFail) {
      if (bestNode && (bestNode.x !== start.x || bestNode.y !== start.y)) {
        return this.reconstructPath(bestNode);
      }
      // Başlangıç noktasından çıkılamıyorsa komşu ilk yürünebilir kareyi dene
      for (const dir of dirs) {
        const nx = start.x + dir.dx;
        const ny = start.y + dir.dy;
        if (this.map.inBounds(nx, ny) && this.isWalkable(nx, ny)) {
          return [{ x: start.x, y: start.y }, { x: nx, y: ny }];
        }
      }
    }

    // Yol bulunamadı
    return null;
  }


  // Yolu başlangıçtan hedefe doğru yeniden oluştur
  private reconstructPath(node: PathNode): TilePos[] {
    const path: TilePos[] = [];
    let curr: PathNode | null = node;
    while (curr) {
      path.push({ x: curr.x, y: curr.y });
      curr = curr.parent;
    }
    path.reverse();
    return path;
  }

  // Chebyshev / Euclidean karma sezgisel fonksiyon
  private heuristic(x1: number, y1: number, x2: number, y2: number): number {
    const dx = Math.abs(x1 - x2);
    const dy = Math.abs(y1 - y2);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  }

  // Noktanın dikdörtgene Chebyshev uzaklığı
  private distanceToRect(
    x: number,
    y: number,
    rect: { x: number; y: number; w: number; h: number }
  ): number {
    const dx = Math.max(0, rect.x - x, x - (rect.x + rect.w - 1));
    const dy = Math.max(0, rect.y - y, y - (rect.y + rect.h - 1));
    return Math.max(dx, dy);
  }
}
