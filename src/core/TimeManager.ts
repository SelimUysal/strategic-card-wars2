import { EventManager } from './EventManager';

export class TimeManager {
  public matchClockRealSec: number = 0;
  public simTimeSec: number = 0;
  public timeScale: number = 1;
  public paused: boolean = false;
  public isMatchRunning: boolean = false;

  private visibilityListener: () => void;

  constructor(private eventManager?: EventManager) {
    this.visibilityListener = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        this.pause();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibilityListener);
    }
  }

  public pause(): void {
    if (!this.paused) {
      this.paused = true;
      this.eventManager?.emit('gamePaused');
    }
  }

  public resume(): void {
    if (this.paused) {
      this.paused = false;
      this.eventManager?.emit('gameResumed');
    }
  }

  public reset(): void {
    this.matchClockRealSec = 0;
    this.simTimeSec = 0;
    this.timeScale = 1;
    this.paused = false;
    this.isMatchRunning = false;
  }

  public setMatchRunning(running: boolean): void {
    this.isMatchRunning = running;
  }

  public destroy(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityListener);
    }
  }
}
