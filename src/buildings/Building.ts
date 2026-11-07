import { BUILDINGS } from '../data/buildings';
import { BuildingId, Team, TilePos } from '../types';

export type BuildingState = 'constructing' | 'active' | 'destroyed';

export class Building {
  public readonly kind: 'building' = 'building';
  public id: string;
  public defId: BuildingId;
  public team: Team;
  public tile: TilePos; // Sol üst kare
  public hp: number;
  public maxHp: number; // Etkin maksimum can
  public state: BuildingState;
  public constructionProgress: number; // 0 ile 1 arası
  public minHp?: number; // İsteğe bağlı sayı; varsa hp bunun altına inmez ve bu değere ulaşınca bina hasar almaz
  public lastAttackerId: string | null;
  public attackCooldown: number;

  constructor(params: {
    id: string;
    defId: BuildingId;
    team: Team;
    tile: TilePos;
    maxHp: number;
    hp?: number;
    state?: BuildingState;
    constructionProgress?: number;
    minHp?: number;
  }) {
    this.id = params.id;
    this.defId = params.defId;
    this.team = params.team;
    this.tile = { x: params.tile.x, y: params.tile.y };
    this.maxHp = params.maxHp;
    this.state = params.state || 'active';
    this.constructionProgress =
      params.constructionProgress !== undefined
        ? params.constructionProgress
        : this.state === 'constructing'
        ? 0
        : 1;
    this.hp =
      params.hp !== undefined
        ? params.hp
        : this.state === 'constructing'
        ? Math.max(1, Math.floor(this.maxHp * 0.1))
        : this.maxHp;
    this.minHp = params.minHp;
    this.lastAttackerId = null;
    this.attackCooldown = 0;
  }

  // SPEC S4 & S6: getRect(): { x, y, w, h }
  public getRect(): { x: number; y: number; w: number; h: number } {
    const def = BUILDINGS[this.defId];
    const w = def ? def.footprint.w : 1;
    const h = def ? def.footprint.h : 1;
    return {
      x: this.tile.x,
      y: this.tile.y,
      w,
      h,
    };
  }

  // SPEC S4 & S6: getCenter(): { x, y }
  public getCenter(): { x: number; y: number } {
    const rect = this.getRect();
    return {
      x: rect.x + rect.w / 2,
      y: rect.y + rect.h / 2,
    };
  }

  // SPEC S4: takeDamage(amount, sourceId)
  // minHp kuralına uyar; öldüyse true döndürür
  public takeDamage(amount: number, sourceId: string): boolean {
    if (this.state === 'destroyed') return true;

    // Eğer minHp tanımlıysa ve mevcut can zaten minHp'ye eşit veya altındaysa hasar almaz
    if (this.minHp !== undefined && this.hp <= this.minHp) {
      return false;
    }

    let nextHp = this.hp - amount;

    // minHp sınırlandırması
    if (this.minHp !== undefined && nextHp < this.minHp) {
      nextHp = this.minHp;
    }

    this.hp = Math.max(0, nextHp);
    this.lastAttackerId = sourceId;

    if (this.hp <= 0) {
      this.state = 'destroyed';
      return true;
    }

    return false;
  }
}
