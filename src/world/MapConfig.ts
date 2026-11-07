import { MATCH_RULES } from '../data/matchRules';
import { Team, TerrainLook, TerrainType, TilePos } from '../types';

export interface ResourceNodeData {
  id: string;
  type: 'gold' | 'wood';
  team: Team;
  tile: TilePos;
}

export class GameMap {
  public width: number;
  public height: number;
  public tiles: TerrainType[];
  public looks: TerrainLook[];
  public playerStart: TilePos;
  public enemyStart: TilePos;
  public commonArea: { x: number; y: number; w: number; h: number };
  public nodes: ResourceNodeData[];

  private nodeTileSet: Set<string> = new Set();

  constructor(
    width: number,
    height: number,
    playerStart: TilePos,
    enemyStart: TilePos,
    commonArea: { x: number; y: number; w: number; h: number },
    tiles: TerrainType[],
    looks: TerrainLook[],
    nodes: ResourceNodeData[]
  ) {
    this.width = width;
    this.height = height;
    this.playerStart = { ...playerStart };
    this.enemyStart = { ...enemyStart };
    this.commonArea = { ...commonArea };
    this.tiles = tiles;
    this.looks = looks;
    this.nodes = nodes;

    for (const node of nodes) {
      this.nodeTileSet.add(`${node.tile.x},${node.tile.y}`);
    }
  }

  public inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  public getTile(x: number, y: number): { type: TerrainType; look: TerrainLook } | null {
    if (!this.inBounds(x, y)) return null;
    const index = y * this.width + x;
    return {
      type: this.tiles[index],
      look: this.looks[index],
    };
  }

  public isWalkable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const tileType = this.tiles[y * this.width + x];
    return tileType === 'flat' || tileType === 'forest' || tileType === 'passage';
  }

  public isBuildable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    // İnşa edilebilir: yalnızca flat ve üzerinde kaynak noktası olmamalı
    const isFlat = this.tiles[y * this.width + x] === 'flat';
    return isFlat && !this.nodeTileSet.has(`${x},${y}`);
  }

  public isInCommonArea(x: number, y: number): boolean {
    return (
      x >= this.commonArea.x &&
      x < this.commonArea.x + this.commonArea.w &&
      y >= this.commonArea.y &&
      y < this.commonArea.y + this.commonArea.h
    );
  }

  public isInPlayerZone(team: Team, x: number, y: number): boolean {
    const center = this.getHqCenter(team);
    const dist = Math.hypot(x - center.x, y - center.y);
    return dist <= MATCH_RULES.placementZoneRadius;
  }

  public getHqCenter(team: Team): TilePos {
    const start = team === 'player' ? this.playerStart : this.enemyStart;
    return {
      x: start.x + 3,
      y: start.y + 3,
    };
  }

  public getCommonAreaCenter(): TilePos {
    return {
      x: this.commonArea.x + this.commonArea.w / 2,
      y: this.commonArea.y + this.commonArea.h / 2,
    };
  }
}
