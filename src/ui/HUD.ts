import { AudioManager } from '../audio/AudioManager';
import { BuildingManager } from '../buildings/BuildingManager';
import { CommanderManager } from '../commanders/CommanderManager';
import { MatchPhaseManager } from '../core/MatchPhaseManager';
import { TimeManager } from '../core/TimeManager';
import { MATCH_RULES } from '../data/matchRules';
import { DifficultyId, FactionDef } from '../types';

export class HUD {
  private element: HTMLElement;
  private hqHpTextEl: HTMLElement;
  private hqHpBarFillEl: HTMLElement;
  private enemyHqTextEl: HTMLElement;
  private enemyHqHpBarFillEl: HTMLElement;
  private timeEl: HTMLElement;
  private speedEl: HTMLElement;
  private speedBtn: HTMLButtonElement;
  private phaseEl: HTMLElement;
  private commandersEl: HTMLElement | null = null;
  private playerCommanderEl: HTMLElement | null = null;
  private enemyCommanderEl: HTMLElement | null = null;

  private updateInterval: number | null = null;

  constructor(
    private parent: HTMLElement,
    private buildingManager: BuildingManager,
    private timeManager: TimeManager,
    private matchPhaseManager: MatchPhaseManager,
    private commanderManager: CommanderManager,
    private difficultyId: DifficultyId,
    private enemyFaction: FactionDef
  ) {
    this.element = document.createElement('div');
    this.element.className = 'hud-container';

    const isCehennem = this.difficultyId === 'cehennem';

    this.element.innerHTML = `
      <div class="hud-hq-box" data-field="hq-box">
        <div class="hud-hq-title">Ana Karargâh</div>
        <div class="hud-hp-bar-bg">
          <div class="hud-hp-bar-fill" data-field="hq-fill"></div>
        </div>
        <div class="hud-hp-bar-text" data-field="hq-text">0 / 0</div>

        <div class="hud-hq-title" style="margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 6px;">Düşman Ana Karargâh</div>
        <div class="hud-hp-bar-bg">
          <div class="hud-hp-bar-fill" data-field="enemy-hq-fill"></div>
        </div>
        <div class="hud-hp-bar-text" data-field="enemy-hq-text">???</div>
      </div>

      <div class="hud-top-right-panel">
        <div class="hud-clock-speed-box">
          <span class="hud-time" data-field="time">00:00</span>
          <span class="hud-speed-badge" data-field="speed">1x</span>
        </div>
        <div class="hud-phase-label" data-field="phase">Hazırlanma</div>
        ${
          isCehennem
            ? ''
            : `
        <div class="hud-commanders" data-field="commanders">
          <span>Komutan: <span data-field="player-cmd">-</span></span>
          <span>vs</span>
          <span class="hud-enemy-team">
            <span class="hud-team-color-dot" style="background-color: ${this.enemyFaction.colorHex}"></span>
            <span>${this.enemyFaction.nameTr}:</span>
            <span data-field="enemy-cmd">???</span>
          </span>
        </div>
        `
        }
        <div class="hud-actions">
          <button type="button" class="hud-btn" data-action="user-speed">Hızlandır: 1x</button>
          <button type="button" class="hud-btn hud-btn-pause" data-action="pause">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            Duraklat
          </button>
        </div>
      </div>
    `;

    this.hqHpTextEl = this.element.querySelector('[data-field="hq-text"]') as HTMLElement;
    this.hqHpBarFillEl = this.element.querySelector('[data-field="hq-fill"]') as HTMLElement;
    this.enemyHqTextEl = this.element.querySelector('[data-field="enemy-hq-text"]') as HTMLElement;
    this.enemyHqHpBarFillEl = this.element.querySelector('[data-field="enemy-hq-fill"]') as HTMLElement;
    this.timeEl = this.element.querySelector('[data-field="time"]') as HTMLElement;
    this.speedEl = this.element.querySelector('[data-field="speed"]') as HTMLElement;
    this.speedBtn = this.element.querySelector('[data-action="user-speed"]') as HTMLButtonElement;
    this.phaseEl = this.element.querySelector('[data-field="phase"]') as HTMLElement;

    if (!isCehennem) {
      this.commandersEl = this.element.querySelector('[data-field="commanders"]');
      this.playerCommanderEl = this.element.querySelector('[data-field="player-cmd"]');
      this.enemyCommanderEl = this.element.querySelector('[data-field="enemy-cmd"]');
    }

    this.speedBtn.addEventListener('click', () => {
      AudioManager.getInstance().playSfx('sfx_hiz');
      const options = MATCH_RULES.userSpeedOptions;
      const curr = this.timeManager.userSpeed;
      const idx = options.indexOf(curr);
      const nextVal = options[(idx + 1) % options.length];
      this.timeManager.setUserSpeed(nextVal);
      this.speedBtn.textContent = `Hızlandır: ${this.timeManager.userSpeed}x`;
      this.update();
    });

    const pauseBtn = this.element.querySelector('[data-action="pause"]') as HTMLButtonElement;
    pauseBtn.addEventListener('click', () => {
      AudioManager.getInstance().playSfx('sfx_duraklat');
      this.timeManager.pause();
    });

    this.parent.appendChild(this.element);

    this.update();

    this.updateInterval = window.setInterval(() => {
      this.update();
    }, 100);
  }

  public update(): void {
    // 1. Ana Karargâh can çubuğu
    const playerHq = this.buildingManager.getHq('player');
    if (playerHq && playerHq.state !== 'destroyed') {
      const currentHp = Math.max(0, Math.round(playerHq.hp));
      const maxHp = playerHq.maxHp;
      this.hqHpTextEl.textContent = `${currentHp} / ${maxHp}`;
      const pct = Math.max(0, Math.min(100, (currentHp / maxHp) * 100));
      this.hqHpBarFillEl.style.width = `${pct}%`;
    } else {
      this.hqHpTextEl.textContent = '0 / 0';
      this.hqHpBarFillEl.style.width = '0%';
    }

    // 1b. Düşman Ana Karargâh can çubuğu
    const enemyHq = this.buildingManager.getHq('enemy');
    const canSeeEnemy = this.commanderManager.isEnemyCommanderRevealed();
    if (canSeeEnemy && enemyHq && enemyHq.state !== 'destroyed') {
      const currentHp = Math.max(0, Math.round(enemyHq.hp));
      const maxHp = enemyHq.maxHp;
      this.enemyHqTextEl.textContent = `${currentHp} / ${maxHp}`;
      const pct = Math.max(0, Math.min(100, (currentHp / maxHp) * 100));
      this.enemyHqHpBarFillEl.style.width = `${pct}%`;
    } else if (enemyHq && enemyHq.state === 'destroyed') {
      this.enemyHqTextEl.textContent = '0 / 0';
      this.enemyHqHpBarFillEl.style.width = '0%';
    } else if (canSeeEnemy && !enemyHq) {
      this.enemyHqTextEl.textContent = '0 / 0';
      this.enemyHqHpBarFillEl.style.width = '0%';
    } else {
      this.enemyHqTextEl.textContent = '???';
      this.enemyHqHpBarFillEl.style.width = '0%';
    }

    // 2. Süre (mm:ss, maç saati)
    const totalSec = Math.floor(this.timeManager.matchClockRealSec);
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    const mm = minutes.toString().padStart(2, '0');
    const ss = seconds.toString().padStart(2, '0');
    this.timeEl.textContent = `${mm}:${ss}`;

    // 3. Oyun hızı etiketi (ETKİN simülasyon hızını gösterir: faz x oyuncu hızı)
    const effectiveScale = this.timeManager.getEffectiveTimeScale();
    const formattedScale = effectiveScale.toString().replace('.', ',');
    this.speedEl.textContent = `${formattedScale}x`;
    this.speedBtn.textContent = `Hızlandır: ${this.timeManager.userSpeed}x`;

    // 4. Faz etiketi ('Hazırlanma', 'Savaş başlıyor', 'Savaş başladı')
    const phase = this.matchPhaseManager.getPhase();
    let phaseText = 'Hazırlanma';
    if (phase === 'march') phaseText = 'Savaş başlıyor';
    else if (phase === 'war') phaseText = 'Savaş başladı';
    this.phaseEl.textContent = phaseText;

    // 5. Komutanlar
    if (this.commandersEl && this.playerCommanderEl && this.enemyCommanderEl) {
      const playerCmdDef = this.commanderManager.getCommanderDef('player');
      this.playerCommanderEl.textContent = playerCmdDef ? playerCmdDef.nameTr : '-';

      if (this.commanderManager.isEnemyCommanderRevealed()) {
        const enemyCmdDef = this.commanderManager.getCommanderDef('enemy');
        this.enemyCommanderEl.textContent = enemyCmdDef ? enemyCmdDef.nameTr : '???';
      } else {
        this.enemyCommanderEl.textContent = '???';
      }
    }
  }

  /**
   * S2: Eksik olan kaynağın (Altın ve/veya Odun) değeri 1 sn kırmızı yanıp söner [EK]
   */
  public static flashResource(resource: 'gold' | 'wood' | 'both'): void {
    const selectors: string[] = [];
    if (resource === 'gold' || resource === 'both') {
      selectors.push('.resource-gold', '.resource-gold [data-field="gold"]');
    }
    if (resource === 'wood' || resource === 'both') {
      selectors.push('.resource-wood', '.resource-wood [data-field="wood"]');
    }
    const elements = document.querySelectorAll(selectors.join(', '));
    elements.forEach((el) => {
      el.classList.remove('resource-flash-red');
      // Reflow tetikle
      void (el as HTMLElement).offsetWidth;
      el.classList.add('resource-flash-red');
      window.setTimeout(() => {
        el.classList.remove('resource-flash-red');
      }, 1000);
    });
  }

  public destroy(): void {
    if (this.updateInterval !== null) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    if (this.element.parentElement) {
      this.element.parentElement.removeChild(this.element);
    }
  }
}
