import { MATCH_RULES } from '../data/matchRules';
import { EventManager } from './EventManager';
import { TimeManager } from './TimeManager';

export type MatchPhase = 'prep' | 'march' | 'war';

export class MatchPhaseManager {
  private currentPhase: MatchPhase = 'prep';

  constructor(
    private timeManager: TimeManager,
    private eventManager: EventManager
  ) {}

  public startMatch(): void {
    this.currentPhase = 'prep';
    this.applyPhase('prep');
  }

  public update(): void {
    const matchClock = this.timeManager.matchClockRealSec;
    let targetPhase: MatchPhase = 'prep';

    for (let i = MATCH_RULES.phases.length - 1; i >= 0; i--) {
      const phase = MATCH_RULES.phases[i];
      if (matchClock >= phase.fromRealSec) {
        targetPhase = phase.id as MatchPhase;
        break;
      }
    }

    if (targetPhase !== this.currentPhase) {
      this.applyPhase(targetPhase);
    }
  }

  private applyPhase(phaseId: MatchPhase): void {
    this.currentPhase = phaseId;
    const phaseRule = MATCH_RULES.phases.find((p) => p.id === phaseId);
    if (phaseRule) {
      this.timeManager.timeScale = phaseRule.timeScale;
    }
    this.eventManager.emit('phaseChanged', phaseId);
  }

  public getPhase(): MatchPhase {
    return this.currentPhase;
  }

  public isCombatAllowed(): boolean {
    return this.timeManager.matchClockRealSec >= MATCH_RULES.combatStartRealSec;
  }

  public isMarchPhase(): boolean {
    return (
      this.timeManager.matchClockRealSec >= MATCH_RULES.marchStartRealSec &&
      this.timeManager.matchClockRealSec < MATCH_RULES.combatStartRealSec
    );
  }

  public isEnemyHiddenFromPlayer(): boolean {
    return this.timeManager.matchClockRealSec < MATCH_RULES.combatStartRealSec;
  }

  public reset(): void {
    this.currentPhase = 'prep';
  }
}
