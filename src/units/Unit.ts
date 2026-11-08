import { Team, TilePos, UnitId } from '../types';

export type UnitState = 'idle' | 'moving' | 'attacking' | 'gathering' | 'dead';
export type UnitMode = 'waiting' | 'attack';
export type WorkerDeliveryState = 'toNode' | 'gathering' | 'returning' | 'depositing';

export class Unit {
  public readonly kind: 'unit' = 'unit';
  public id: string;
  public defId: UnitId;
  public team: Team;
  public hp: number;
  public maxHp: number;
  public pos: { x: number; y: number };
  public state: UnitState;
  public path: TilePos[];
  public pathIndex: number;
  public lastAttackerId: string | null;
  public attackCooldown: number;
  public mode: UnitMode;

  // SPEC S4: Bekçi (watchdog) takip alanları
  public stuckTimer: number = 0;
  public lastStuckPos: { x: number; y: number } = { x: 0, y: 0 };
  public stuckRetryCount: number = 0;
  public currentTargetId: string | null = null;

  // SPEC S8: İşçi taşıma alanları ve durumları
  public carriedType: 'gold' | 'wood' | null = null;
  public carriedAmount: number = 0;
  public workerState: WorkerDeliveryState = 'toNode';

  // Çizim ve yönelim için ek durum
  public rotationY: number = 0;
  public deathTimer: number = 0; // Ölürken küçülme animasyonu için
  public animPhase: number = Math.random() * Math.PI * 2; // R11C A7: Eşzamansız animasyon fazı
  public damageFlashTimer: number = 0; // R11C A4: Hasar parlama sayacı
  public attackAnimTimer: number = 0; // R11C A3: Saldırı animasyonu sayacı

  constructor(params: {
    id: string;
    defId: UnitId;
    team: Team;
    maxHp: number;
    pos: { x: number; y: number };
    hp?: number;
  }) {
    this.id = params.id;
    this.defId = params.defId;
    this.team = params.team;
    this.maxHp = params.maxHp;
    this.hp = params.hp !== undefined ? params.hp : params.maxHp;
    this.pos = { x: params.pos.x, y: params.pos.y };
    this.state = 'idle';
    this.path = [];
    this.pathIndex = 0;
    this.lastAttackerId = null;
    this.attackCooldown = 0;
    this.mode = 'waiting';
    this.lastStuckPos = { x: params.pos.x, y: params.pos.y };
  }


  // SPEC S2: Hareket: path boyunca, etkin moveSpeed x dt ile ilerler; karelerin merkezlerinden geçer
  public updateMovement(dt: number, effectiveMoveSpeed: number): void {
    if (this.state !== 'moving' || this.path.length === 0) return;

    if (this.pathIndex >= this.path.length) {
      this.state = 'idle';
      this.path = [];
      this.pathIndex = 0;
      return;
    }

    const targetTile = this.path[this.pathIndex];
    // Karenin merkezi: tile.x + 0.5, tile.y + 0.5
    const targetX = targetTile.x + 0.5;
    const targetY = targetTile.y + 0.5;

    const dx = targetX - this.pos.x;
    const dy = targetY - this.pos.y;
    const dist = Math.hypot(dx, dy);

    // Birimin dönme açısını güncelle (XZ düzleminde hareket)
    if (dist > 0.001) {
      this.rotationY = Math.atan2(dx, dy);
    }

    const step = effectiveMoveSpeed * dt;

    if (dist <= step) {
      // Hedef karenin merkezine ulaşıldı
      this.pos.x = targetX;
      this.pos.y = targetY;
      this.pathIndex++;

      if (this.pathIndex >= this.path.length) {
        this.state = 'idle';
        this.path = [];
        this.pathIndex = 0;
      }
    } else {
      this.pos.x += (dx / dist) * step;
      this.pos.y += (dy / dist) * step;
    }
  }

  public setPath(path: TilePos[]): void {
    if (!path || path.length === 0) {
      this.path = [];
      this.pathIndex = 0;
      if (this.state === 'moving') this.state = 'idle';
      this.stuckTimer = 0;
      this.stuckRetryCount = 0;
      return;
    }

    this.path = path;
    // Eğer birim zaten ilk karenin merkezindeyse veya hemen yanındaysa sonraki adımdan başla
    const firstTile = path[0];
    const distToFirst = Math.hypot(
      firstTile.x + 0.5 - this.pos.x,
      firstTile.y + 0.5 - this.pos.y
    );
    this.pathIndex = distToFirst < 0.2 && path.length > 1 ? 1 : 0;
    this.state = 'moving';
    this.stuckTimer = 0;
    this.lastStuckPos = { x: this.pos.x, y: this.pos.y };
  }

  // SPEC S4: Bekçi (watchdog) kontrolü
  public checkWatchdog(dt: number, timeoutSec: number = 3): { isStuck: boolean; retryCount: number } {
    if (this.state !== 'moving') {
      this.stuckTimer = 0;
      this.stuckRetryCount = 0;
      this.lastStuckPos = { x: this.pos.x, y: this.pos.y };
      return { isStuck: false, retryCount: 0 };
    }

    this.stuckTimer += dt;
    if (this.stuckTimer >= timeoutSec) {
      this.stuckTimer = 0;
      const dist = Math.hypot(this.pos.x - this.lastStuckPos.x, this.pos.y - this.lastStuckPos.y);
      this.lastStuckPos = { x: this.pos.x, y: this.pos.y };

      if (dist < 0.3) {
        this.stuckRetryCount++;
        return { isStuck: true, retryCount: this.stuckRetryCount };
      } else {
        this.stuckRetryCount = 0;
      }
    }

    return { isStuck: false, retryCount: this.stuckRetryCount };
  }


  // SPEC S2: takeDamage(amount, sourceId): hp azaltır, lastAttackerId'yi günceller, ölüp ölmediğini döndürür
  public takeDamage(amount: number, sourceId: string): boolean {
    if (this.state === 'dead') return true;

    this.hp = Math.max(0, this.hp - amount);
    this.lastAttackerId = sourceId;
    this.damageFlashTimer = 0.15; // R11C A4: Hasar parlama süresi

    if (this.hp <= 0) {
      this.state = 'dead';
      return true;
    }
    return false;
  }

  // SPEC S6: entity.getCenter(), entity.getRect() (birim için 1x1 kare)
  public getCenter(): { x: number; y: number } {
    return { x: this.pos.x, y: this.pos.y };
  }

  public getRect(): { x: number; y: number; w: number; h: number } {
    // 1x1 kare
    return {
      x: Math.floor(this.pos.x),
      y: Math.floor(this.pos.y),
      w: 1,
      h: 1,
    };
  }
}
