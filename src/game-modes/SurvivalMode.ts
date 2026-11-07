import { EventManager } from '../core/EventManager';
import { TimeManager } from '../core/TimeManager';
import { REWARDS } from '../data/rewards';
import { AccountManager } from '../progression/AccountManager';
import { MapId } from '../types';

export interface SurvivalThresholdEvent {
  threshold: { afterRealSec: number; gold: number };
  currentSec: number;
}

export class SurvivalMode {
  private active: boolean = false;
  private currentMapId: MapId = 'rumeli_ovasi';
  private passedThresholds: Set<number> = new Set();
  private newRecord: boolean = false;

  constructor(
    private timeManager: TimeManager,
    private accountManager: AccountManager,
    private eventManager?: EventManager
  ) {}

  public init(mapId: MapId, isCehennem: boolean): void {
    this.active = isCehennem;
    this.currentMapId = mapId;
    this.passedThresholds.clear();
    this.newRecord = false;
  }

  // SPEC S3: Her karede maç saatini kontrol eder, eşikler geçilince 'survivalThresholdReached' olayı yayınlar
  public update(): void {
    if (!this.active) return;

    const clockSec = this.timeManager.matchClockRealSec;

    for (let i = 0; i < REWARDS.survivalThresholds.length; i++) {
      if (!this.passedThresholds.has(i)) {
        const th = REWARDS.survivalThresholds[i];
        if (clockSec >= th.afterRealSec) {
          this.passedThresholds.add(i);
          if (this.eventManager) {
            this.eventManager.emit('survivalThresholdReached', {
              threshold: th,
              currentSec: clockSec,
            });
          }
        }
      }
    }
  }

  // SPEC S3: Maç bitince rekor kontrolü ve güncellemesi
  // Rekor harita başınadır: süre öncekinden uzunsa yeni rekordur ve 'isNewRecord' true döner
  public async handleMatchEnd(survivalTimeSec: number): Promise<{
    isNewRecord: boolean;
    previousRecordSec: number;
    currentRecordSec: number;
  }> {
    if (!this.active) {
      return { isNewRecord: false, previousRecordSec: 0, currentRecordSec: 0 };
    }

    const previousRecordSec = this.accountManager.getSurvivalRecord(this.currentMapId);
    if (survivalTimeSec > previousRecordSec) {
      this.newRecord = true;
      await this.accountManager.setSurvivalRecord(this.currentMapId, survivalTimeSec);
      return {
        isNewRecord: true,
        previousRecordSec,
        currentRecordSec: survivalTimeSec,
      };
    }

    return {
      isNewRecord: false,
      previousRecordSec,
      currentRecordSec: previousRecordSec,
    };
  }

  public isNewRecord(): boolean {
    return this.newRecord;
  }

  public isActive(): boolean {
    return this.active;
  }
}
