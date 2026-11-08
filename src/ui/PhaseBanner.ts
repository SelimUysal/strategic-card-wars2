import { EventManager } from '../core/EventManager';
import { MatchPhaseManager } from '../core/MatchPhaseManager';
import { TimeManager } from '../core/TimeManager';
import { MATCH_RULES } from '../data/matchRules';
import { DifficultyId } from '../types';

export class PhaseBanner {
  private element: HTMLElement;
  private titleEl: HTMLElement;
  private subEl: HTMLElement;

  private currentShownPhase: string | null = null;
  private warBannerTimer: number = 0;
  private isWarBannerActive: boolean = false;
  private isWarBannerFadingOut: boolean = false;

  private onPhaseChangedBound: (phase: string) => void;
  private updateInterval: number | null = null;
  private lastRealSec: number = 0;

  constructor(
    private parent: HTMLElement,
    private timeManager: TimeManager,
    _matchPhaseManager: MatchPhaseManager,
    private eventManager: EventManager,
    private difficultyId: DifficultyId
  ) {
    this.element = document.createElement('div');
    this.element.className = 'phase-banner';

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      this.element.classList.add('reduced-motion');
    }

    this.titleEl = document.createElement('div');
    this.titleEl.className = 'phase-banner-title';
    this.subEl = document.createElement('div');
    this.subEl.className = 'phase-banner-sub';

    this.element.appendChild(this.titleEl);
    this.element.appendChild(this.subEl);
    this.parent.appendChild(this.element);

    this.onPhaseChangedBound = (phase: string) => {
      this.handlePhaseChanged(phase);
    };
    this.eventManager.on('phaseChanged', this.onPhaseChangedBound as any);

    this.update();

    // Saniyede 10 kez kontrol (100 ms)
    this.updateInterval = window.setInterval(() => {
      this.update();
    }, 100);
  }

  private handlePhaseChanged(phase: string): void {
    if (phase === 'war') {
      this.isWarBannerActive = true;
      this.isWarBannerFadingOut = false;
      this.warBannerTimer = 0;
    }
  }

  public update(): void {
    if (this.timeManager.paused) return;

    const clock = this.timeManager.matchClockRealSec;
    const marchPhaseRule = MATCH_RULES.phases.find((p) => p.id === 'march');
    const warPhaseRule = MATCH_RULES.phases.find((p) => p.id === 'war');
    const marchStart = marchPhaseRule ? marchPhaseRule.fromRealSec : 240;
    const warStart = warPhaseRule ? warPhaseRule.fromRealSec : 300;

    const marchScaleStr = marchPhaseRule ? marchPhaseRule.timeScale.toString().replace('.', ',') : '1,5';
    const warScaleStr = warPhaseRule ? warPhaseRule.timeScale.toString().replace('.', ',') : '2';

    // 04:00 (240s) ile 05:00 (300s) arasında: Hazırlanma şeridi
    if (clock >= marchStart && clock < warStart) {
      if (this.currentShownPhase !== 'march') {
        this.currentShownPhase = 'march';
        this.titleEl.textContent = `Oyun hızı ${marchScaleStr}x oldu, kaynak toplama hızlandı. Askerler sefere hazırlanıyor.`;
        this.subEl.textContent = '';
        this.element.classList.add('visible');
      }
    } else if (clock >= warStart) {
      // 05:00 (300s) ve sonrasında 'HARP BAŞLADI!' (ilk 6 saniye)
      if (!this.isWarBannerActive && this.currentShownPhase !== 'war_done') {
        this.isWarBannerActive = true;
        this.warBannerTimer = 0;
      }

      if (this.isWarBannerActive) {
        // dt tahmini: 0.1 sn (100 ms aralık)
        const dt = Math.max(0, clock - this.lastRealSec);
        if (dt > 0 && dt < 2.0) {
          this.warBannerTimer += dt;
        } else {
          this.warBannerTimer += 0.1;
        }

        if (this.currentShownPhase !== 'war') {
          this.currentShownPhase = 'war';
          this.titleEl.textContent = 'HARP BAŞLADI!';
          const isCehennem = this.difficultyId === 'cehennem';
          this.subEl.textContent = isCehennem
            ? `Oyun hızı ${warScaleStr}x. Hayatta kal.`
            : `Oyun hızı ${warScaleStr}x. Düşman karargâhını yok et.`;
          this.element.classList.add('visible', 'war-mode');
        }

        // 6 gerçek saniye sonra kaybolur
        if (this.warBannerTimer >= 6.0 && !this.isWarBannerFadingOut) {
          this.isWarBannerFadingOut = true;
          this.element.classList.remove('visible');
          window.setTimeout(() => {
            this.isWarBannerActive = false;
            this.currentShownPhase = 'war_done';
          }, 400);
        }
      }
    } else {
      if (this.currentShownPhase !== null && this.currentShownPhase !== 'war_done') {
        this.currentShownPhase = null;
        this.element.classList.remove('visible', 'war-mode');
      }
    }

    this.lastRealSec = clock;
  }

  public destroy(): void {
    if (this.updateInterval !== null) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.eventManager.off('phaseChanged', this.onPhaseChangedBound as any);
    if (this.element.parentElement) {
      this.element.parentElement.removeChild(this.element);
    }
  }
}
