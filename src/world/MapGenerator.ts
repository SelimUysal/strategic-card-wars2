import { MATCH_RULES } from '../data/matchRules';
import { MapDef, Team, TerrainLook, TerrainType, TilePos } from '../types';
import { GameMap, ResourceNodeData } from './MapConfig';

// Deterministik Mulberry32 tohumlu rastgele sayı üreteci
class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = Math.floor(seed) >>> 0;
  }

  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

export class MapGenerator {
  public static generate(mapDef: MapDef, seed: number): GameMap {
    const { width, height, playerStart, enemyStart, commonArea, rects, nodes } = mapDef;
    const rng = new SeededRNG(seed);

    // Varsayılan zemin: düz ve çimen (flat, grass)
    const tiles: TerrainType[] = new Array(width * height).fill('flat');
    const looks: TerrainLook[] = new Array(width * height).fill('grass');

    // SPEC C2: rects listesini sırayla düz zemin üzerine işler (sonraki öncekinin üstüne biner)
    for (const rect of rects) {
      for (let ry = 0; ry < rect.h; ry++) {
        for (let rx = 0; rx < rect.w; rx++) {
          const tx = rect.x + rx;
          const ty = rect.y + ry;
          if (tx >= 0 && tx < width && ty >= 0 && ty < height) {
            const index = ty * width + tx;
            tiles[index] = rect.type;
            looks[index] = rect.look;
          }
        }
      }
    }

    const occupiedTiles = new Set<string>();
    const generatedNodes: ResourceNodeData[] = [];

    const isInsideHq = (x: number, y: number, start: TilePos): boolean => {
      return x >= start.x && x < start.x + 6 && y >= start.y && y < start.y + 6;
    };

    const playerCenter: TilePos = { x: playerStart.x + 3, y: playerStart.y + 3 };
    const enemyCenter: TilePos = { x: enemyStart.x + 3, y: enemyStart.y + 3 };

    // Kaynak noktası üretme yardımcısı
    const processNodeGroup = (
      templateList: TilePos[],
      type: 'gold' | 'wood',
      team: Team
    ): void => {
      const hqCenter = team === 'player' ? playerCenter : enemyCenter;
      const hqStart = team === 'player' ? playerStart : enemyStart;
      const expectedType: TerrainType = type === 'gold' ? 'flat' : 'forest';

      for (let i = 0; i < templateList.length; i++) {
        const template = templateList[i];
        let chosenX = template.x;
        let chosenY = template.y;
        let found = false;

        // SPEC S3: Her şablon noktasına tohumlu RNG ile -nodeOffsetMax..+nodeOffsetMax aralığında x ve y kayması eklenir.
        // Geçersizse en fazla 20 deneme yapılır.
        const maxAttempts = 20;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const offsetX = rng.nextInt(
            -MATCH_RULES.nodeOffsetMax,
            MATCH_RULES.nodeOffsetMax
          );
          const offsetY = rng.nextInt(
            -MATCH_RULES.nodeOffsetMax,
            MATCH_RULES.nodeOffsetMax
          );

          const testX = template.x + offsetX;
          const testY = template.y + offsetY;
          const key = `${testX},${testY}`;

          // Geçerlilik kontrolleri
          if (testX < 0 || testX >= width || testY < 0 || testY >= height) continue;
          if (occupiedTiles.has(key)) continue;
          if (isInsideHq(testX, testY, hqStart)) continue;

          const distToHq = Math.hypot(testX - hqCenter.x, testY - hqCenter.y);
          if (distToHq > MATCH_RULES.placementZoneRadius) continue;

          const tileType = tiles[testY * width + testX];
          if (tileType !== expectedType) continue;

          // Geçerli bulundu
          chosenX = testX;
          chosenY = testY;
          found = true;
          break;
        }

        // 20 denemede de bulunamadıysa şablon konumu kullanılır
        if (!found) {
          chosenX = template.x;
          chosenY = template.y;
        }

        occupiedTiles.add(`${chosenX},${chosenY}`);
        generatedNodes.push({
          id: `${team}_${type}_${i}`,
          type,
          team,
          tile: { x: chosenX, y: chosenY },
        });
      }
    };

    // Oyuncu ve düşman için altın ve odun noktaları
    processNodeGroup(nodes.gold.player, 'gold', 'player');
    processNodeGroup(nodes.wood.player, 'wood', 'player');
    processNodeGroup(nodes.gold.enemy, 'gold', 'enemy');
    processNodeGroup(nodes.wood.enemy, 'wood', 'enemy');

    const gameMap = new GameMap(
      width,
      height,
      playerStart,
      enemyStart,
      commonArea,
      tiles,
      looks,
      generatedNodes
    );

    return gameMap;
  }

  // SPEC S4: Harita doğrulama
  public static validateMap(map: GameMap, mapDef?: MapDef): void {
    // 1. İki ana karargâh arasında yürünebilir yol kontrolü (BFS)
    const pCenter = map.getHqCenter('player');
    const eCenter = map.getHqCenter('enemy');

    const queue: [number, number][] = [[pCenter.x, pCenter.y]];
    const visited = new Uint8Array(map.width * map.height);
    visited[pCenter.y * map.width + pCenter.x] = 1;

    let hasPath = false;

    while (queue.length > 0) {
      const [cx, cy] = queue.shift()!;
      if (cx === eCenter.x && cy === eCenter.y) {
        hasPath = true;
        break;
      }

      const neighbors: [number, number][] = [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1],
      ];

      for (const [nx, ny] of neighbors) {
        if (map.inBounds(nx, ny)) {
          const idx = ny * map.width + nx;
          if (visited[idx] === 0 && map.isWalkable(nx, ny)) {
            visited[idx] = 1;
            queue.push([nx, ny]);
          }
        }
      }
    }

    if (!hasPath) {
      throw new Error(
        'Harita doğrulama hatası: İki ana karargâh arasında yürünebilir yol bulunamadı!'
      );
    }

    // 2. Nokta sayıları şablonla uyuşma kontrolü
    if (mapDef) {
      const expPlayerGold = mapDef.nodes.gold.player.length;
      const expPlayerWood = mapDef.nodes.wood.player.length;
      const expEnemyGold = mapDef.nodes.gold.enemy.length;
      const expEnemyWood = mapDef.nodes.wood.enemy.length;

      const actPlayerGold = map.nodes.filter(
        (n) => n.team === 'player' && n.type === 'gold'
      ).length;
      const actPlayerWood = map.nodes.filter(
        (n) => n.team === 'player' && n.type === 'wood'
      ).length;
      const actEnemyGold = map.nodes.filter(
        (n) => n.team === 'enemy' && n.type === 'gold'
      ).length;
      const actEnemyWood = map.nodes.filter(
        (n) => n.team === 'enemy' && n.type === 'wood'
      ).length;

      if (
        expPlayerGold !== actPlayerGold ||
        expPlayerWood !== actPlayerWood ||
        expEnemyGold !== actEnemyGold ||
        expEnemyWood !== actEnemyWood
      ) {
        throw new Error(
          `Harita doğrulama hatası: Kaynak noktası sayıları şablonla uyuşmuyor! Beklenen: P(G:${expPlayerGold}, W:${expPlayerWood}) E(G:${expEnemyGold}, W:${expEnemyWood}), Üretilen: P(G:${actPlayerGold}, W:${actPlayerWood}) E(G:${actEnemyGold}, W:${actEnemyWood})`
        );
      }
    }
  }
}
