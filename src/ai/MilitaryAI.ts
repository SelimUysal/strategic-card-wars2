import { BattleAI } from '../combat/BattleAI';
import { EventManager } from '../core/EventManager';
import { TimeManager } from '../core/TimeManager';
import { MATCH_RULES } from '../data/matchRules';
import { UNITS } from '../data/units';
import { DifficultyDef, Team } from '../types';
import { Unit } from '../units/Unit';
import { UnitManager } from '../units/UnitManager';

export class MilitaryAI {
  private firstWaveSent: boolean = false;
  private waveTimer: number = 0;
  private onUnitSpawnedBound: (data: { unit: Unit }) => void;

  constructor(
    private team: Team,
    private difficulty: DifficultyDef,
    private unitManager: UnitManager,
    private battleAI: BattleAI,
    private timeManager: TimeManager,
    private eventManager?: EventManager
  ) {
    this.onUnitSpawnedBound = ({ unit }: { unit: Unit }) => {
      // SPEC S5: continuousWaves true (Cehennem) ise 300'den itibaren yeni üretilen her asker doğar doğmaz saldırı moduna alınır [EK]
      if (
        this.difficulty.continuousWaves &&
        unit.team === this.team &&
        !UNITS[unit.defId]?.tags.includes('worker')
      ) {
        if (this.timeManager.matchClockRealSec >= MATCH_RULES.combatStartRealSec) {
          this.battleAI.setAttackMode(unit, true);
        }
      }
    };

    if (this.eventManager) {
      this.eventManager.on('unitSpawned', this.onUnitSpawnedBound);
    }
  }

  // SPEC S5: Dalga zamanlayıcısı simülasyon zamanı (simDt) ile ilerler
  public update(simDt: number): void {
    if (this.timeManager.matchClockRealSec < MATCH_RULES.combatStartRealSec) {
      return;
    }

    if (
      this.firstWaveSent &&
      !this.difficulty.continuousWaves &&
      this.difficulty.waveIntervalSec !== null
    ) {
      this.waveTimer += simDt;
    }
  }

  // SPEC S5: Karar turunda çağrılır (her decisionIntervalSec'te en fazla 1 eylem)
  public execute(): boolean {
    // 300'e kadar hiçbir birim saldırıya gönderilmez
    if (this.timeManager.matchClockRealSec < MATCH_RULES.combatStartRealSec) {
      return false;
    }

    // continuousWaves true (Cehennem) ise bekleyen bütün askerler hemen gönderilir
    if (this.difficulty.continuousWaves) {
      const waiting = this.getWaitingSoldiers();
      if (waiting.length > 0) {
        for (const u of waiting) {
          this.battleAI.setAttackMode(u, true);
        }
        return true;
      }
      return false;
    }

    // 300'de ilk dalga
    if (!this.firstWaveSent) {
      this.firstWaveSent = true;
      this.waveTimer = 0;
      return this.sendWave();
    }

    // Sonraki dalgalar waveIntervalSec aralıkla
    if (
      this.difficulty.waveIntervalSec !== null &&
      this.waveTimer >= this.difficulty.waveIntervalSec
    ) {
      this.waveTimer -= this.difficulty.waveIntervalSec;
      return this.sendWave();
    }

    return false;
  }

  // SPEC S5: firstWaveFraction oranı (yukarı yuvarlanır) BattleAI.setAttackMode(unit, true) ile saldırıya gönderilir
  private sendWave(): boolean {
    const waiting = this.getWaitingSoldiers();
    if (waiting.length === 0) {
      return false;
    }

    const countToSend = Math.ceil(waiting.length * this.difficulty.firstWaveFraction);
    for (let i = 0; i < countToSend && i < waiting.length; i++) {
      this.battleAI.setAttackMode(waiting[i], true);
    }

    return true;
  }

  private getWaitingSoldiers(): Unit[] {
    return this.unitManager
      .getSoldiers(this.team)
      .filter((u) => u.mode === 'waiting');
  }

  public dispose(): void {
    if (this.eventManager) {
      this.eventManager.off('unitSpawned', this.onUnitSpawnedBound);
    }
  }
}
