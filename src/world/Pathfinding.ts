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

export class Pathfinding {
  private width: number;
  private height: number;
  private dynamicBlocked: Uint16Array;

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

  // SPEC S1 & S2: A* ile findPath(start, goal)
  public findPath(start: TilePos, goal: TilePos): TilePos[] | null {
    if (!this.map.inBounds(start.x, start.y)) return null;

    // Hedef yürünemezse en yakın yürünebilir kareyi hedef al
    let adjustedGoal = goal;
    if (!this.isWalkable(goal.x, goal.y)) {
      const nearest = this.findNearestWalkableTile(goal);
      if (!nearest) return null;
      adjustedGoal = nearest;
    }

    if (start.x === adjustedGoal.x && start.y === adjustedGoal.y) {
      return [{ x: start.x, y: start.y }];
    }

    return this.runAStar(
      start,
      (x, y) => x === adjustedGoal.x && y === adjustedGoal.y,
      (x, y) => this.heuristic(x, y, adjustedGoal.x, adjustedGoal.y)
    );
  }

  // SPEC S2: findPathToRect(start, rect, range)
  // rect'in en yakın kenarına uzaklığı <= range olan ilk yürünebilir kareye giden yol
  public findPathToRect(
    start: TilePos,
    rect: { x: number; y: number; w: number; h: number },
    range: number
  ): TilePos[] | null {
    if (!this.map.inBounds(start.x, start.y)) return null;

    const isInsideRange = (x: number, y: number): boolean => {
      const dist = this.distanceToRect(x, y, rect);
      return dist <= range;
    };

    // Zaten menzil içindeyse
    if (isInsideRange(start.x, start.y)) {
      return [{ x: start.x, y: start.y }];
    }

    return this.runAStar(
      start,
      (x, y) => isInsideRange(x, y),
      (x, y) => this.distanceToRect(x, y, rect)
    );
  }

  // SPEC S2: isReachable(start, goal)
  public isReachable(start: TilePos, goal: TilePos): boolean {
    return this.findPath(start, goal) !== null;
  }

  // A* algoritması çekirdeği
  private runAStar(
    start: TilePos,
    isGoal: (x: number, y: number) => boolean,
    heuristicFn: (x: number, y: number) => number
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
