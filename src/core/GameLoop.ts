import { MATCH_RULES } from '../data/matchRules';
import { MatchPhaseManager } from './MatchPhaseManager';
import { TimeManager } from './TimeManager';

export interface UpdatableSystem {
  update(dt: number): void;
}

export type FrameListener = (realDt: number) => void;

export class GameLoop {
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;
  private lastTime: number = 0;
  private accumulator: number = 0;

  // Aşırı büyük sıçramaları sınırlama (100ms)
  private readonly maxRealDt: number = 0.1;
  // Cihazı korumak için bir karede çalışacak adım üst sınırı
  private readonly maxSubSteps: number = 10;

  private systems: UpdatableSystem[] = [];
  private frameListeners: Set<FrameListener> = new Set();
  private renderCallback: (() => void) | null = null;

  constructor(
    private timeManager: TimeManager,
    private matchPhaseManager: MatchPhaseManager
  ) {}

  public registerSystem(system: UpdatableSystem): void {
    this.systems.push(system);
  }

  public unregisterSystem(system: UpdatableSystem): void {
    const idx = this.systems.indexOf(system);
    if (idx !== -1) {
      this.systems.splice(idx, 1);
    }
  }

  public addFrameListener(listener: FrameListener): void {
    this.frameListeners.add(listener);
  }

  public removeFrameListener(listener: FrameListener): void {
    this.frameListeners.delete(listener);
  }

  public setRenderCallback(callback: () => void): void {
    this.renderCallback = callback;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.tick(this.lastTime);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private tick = (currentTime: number): void => {
    if (!this.isRunning) return;

    const rawDeltaSec = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    // Aşırı büyük sıçramaları sınırlama
    const realDt = Math.min(Math.max(0, rawDeltaSec), this.maxRealDt);

    // Maç saati: yalnızca maç çalışırken ve duraklatılmamışken realDt * userSpeed kadar artar
    if (this.timeManager.isMatchRunning && !this.timeManager.paused) {
      this.timeManager.matchClockRealSec += realDt * this.timeManager.userSpeed;
      this.matchPhaseManager.update();
    }

    // Sabit zaman adımlı simülasyon (etkin simülasyon çarpanı ile)
    if (!this.timeManager.paused) {
      this.accumulator += realDt * this.timeManager.getEffectiveTimeScale();
      let stepCount = 0;

      while (
        this.accumulator >= MATCH_RULES.fixedStepSec &&
        stepCount < this.maxSubSteps
      ) {
        for (const system of this.systems) {
          system.update(MATCH_RULES.fixedStepSec);
        }
        this.timeManager.simTimeSec += MATCH_RULES.fixedStepSec;
        this.accumulator -= MATCH_RULES.fixedStepSec;
        stepCount++;
      }

      // Adım üst sınırına ulaşıldıysa biriktiriciyi sıfırla (spiral of death koruması)
      if (stepCount >= this.maxSubSteps) {
        this.accumulator = 0;
      }
    }

    // Gerçek zamanda kare başına bir kez: arayüz dinleyicileri
    for (const listener of this.frameListeners) {
      listener(realDt);
    }

    // Gerçek zamanda kare başına bir kez: çizim
    if (this.renderCallback) {
      this.renderCallback();
    }

    this.animationFrameId = requestAnimationFrame(this.tick);
  };
}
