import { BuildingManager } from '../buildings/BuildingManager';
import { CommanderManager } from '../commanders/CommanderManager';
import { TimeManager } from '../core/TimeManager';
import { REWARDS } from '../data/rewards';
import { RewardManager } from '../progression/RewardManager';
import { DifficultyId, FactionDef } from '../types';

export class HUD {
  private element: HTMLElement;
  private hqHpTextEl: HTMLElement;
  private hqHpBarFillEl: HTMLElement;
  private timeEl: HTMLElement;
  private speedEl: HTMLElement;
  private commandersEl: HTMLElement | null = null;
  private playerCommanderEl: HTMLElement | null = null;
  private enemyCommanderEl: HTMLElement | null = null;
  private pauseResumeBtn: HTMLButtonElement;
  private exitModalEl: HTMLElement | null = null;

  private updateInterval: number | null = null;

  constructor(
    private parent: HTMLElement,
    private buildingManager: BuildingManager,
    private timeManager: TimeManager,
    private commanderManager: CommanderManager,
    private rewardManager: RewardManager | null,
    private difficultyId: DifficultyId,
    private enemyFaction: FactionDef
  ) {
    this.element = document.createElement('div');
    this.element.className = 'hud-top-bar';

    const isCehennem = this.difficultyId === 'cehennem';

    this.element.innerHTML = `
      <div class="hud-hq-box">
        <div class="hud-hq-title">Ana Karargâh</div>
        <div class="hud-hp-bar-bg">
          <div class="hud-hp-bar-fill" data-field="hq-fill"></div>
        </div>
        <div class="hud-hp-bar-text" data-field="hq-text">0 / 0</div>
      </div>

      <div class="hud-center-info">
        <div class="hud-time-speed">
          <span>Süre: <span data-field="time">00:00</span></span>
          <span class="hud-speed-badge" data-field="speed">1x</span>
        </div>
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
      </div>

      <div class="hud-actions">
        <button type="button" class="hud-btn" data-action="pause-resume">Duraklat</button>
        <button type="button" class="hud-btn hud-btn-exit" data-action="exit">Çık</button>
      </div>
    `;

    this.hqHpTextEl = this.element.querySelector('[data-field="hq-text"]') as HTMLElement;
    this.hqHpBarFillEl = this.element.querySelector('[data-field="hq-fill"]') as HTMLElement;
    this.timeEl = this.element.querySelector('[data-field="time"]') as HTMLElement;
    this.speedEl = this.element.querySelector('[data-field="speed"]') as HTMLElement;
    this.pauseResumeBtn = this.element.querySelector('[data-action="pause-resume"]') as HTMLButtonElement;

    if (!isCehennem) {
      this.commandersEl = this.element.querySelector('[data-field="commanders"]');
      this.playerCommanderEl = this.element.querySelector('[data-field="player-cmd"]');
      this.enemyCommanderEl = this.element.querySelector('[data-field="enemy-cmd"]');
    }

    this.pauseResumeBtn.addEventListener('click', () => {
      if (this.timeManager.paused) {
        this.timeManager.resume();
      } else {
        this.timeManager.pause();
      }
      this.updatePauseResumeButton();
    });

    const exitBtn = this.element.querySelector('[data-action="exit"]') as HTMLButtonElement;
    exitBtn.addEventListener('click', () => {
      this.openExitModal();
    });

    this.parent.appendChild(this.element);

    this.update();

    // Saniyede yaklaşık 10 kez yenilenir (100 ms)
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

    // 2. Süre (mm:ss, maç saati)
    const totalSec = Math.floor(this.timeManager.matchClockRealSec);
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    const mm = minutes.toString().padStart(2, '0');
    const ss = seconds.toString().padStart(2, '0');
    this.timeEl.textContent = `${mm}:${ss}`;

    // 3. Oyun hızı etiketi ('1x', '1,5x', '2x')
    let speedLabel = '1x';
    if (this.timeManager.timeScale === 1.5) {
      speedLabel = '1,5x';
    } else if (this.timeManager.timeScale === 2) {
      speedLabel = '2x';
    }
    this.speedEl.textContent = speedLabel;

    // 4. Komutanlar
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

    // 5. Duraklat / Devam Et düğmesi
    this.updatePauseResumeButton();
  }

  private updatePauseResumeButton(): void {
    if (this.timeManager.paused) {
      this.pauseResumeBtn.textContent = 'Devam Et';
    } else {
      this.pauseResumeBtn.textContent = 'Duraklat';
    }
  }

  private openExitModal(): void {
    if (this.exitModalEl) return;

    this.exitModalEl = document.createElement('div');
    this.exitModalEl.className = 'hud-modal-overlay';
    this.exitModalEl.innerHTML = `
      <div class="hud-modal-box">
        <div class="hud-modal-text">
          Savaştan çıkarsan mağlup sayılırsın ve ${REWARDS.exitPenaltyGold} hesap altını kaybedersin. Çıkmak istiyor musun?
        </div>
        <div class="hud-modal-buttons">
          <button type="button" class="hud-modal-btn-confirm" data-action="confirm-exit">Evet, çık</button>
          <button type="button" class="hud-modal-btn-cancel" data-action="cancel-exit">Vazgeç</button>
        </div>
      </div>
    `;

    const confirmBtn = this.exitModalEl.querySelector('[data-action="confirm-exit"]') as HTMLButtonElement;
    const cancelBtn = this.exitModalEl.querySelector('[data-action="cancel-exit"]') as HTMLButtonElement;

    confirmBtn.addEventListener('click', async () => {
      this.closeExitModal();
      if (this.rewardManager) {
        await this.rewardManager.exitMatch();
      }
    });

    cancelBtn.addEventListener('click', () => {
      this.closeExitModal();
    });

    this.parent.appendChild(this.exitModalEl);
  }

  private closeExitModal(): void {
    if (this.exitModalEl && this.exitModalEl.parentElement) {
      this.exitModalEl.parentElement.removeChild(this.exitModalEl);
      this.exitModalEl = null;
    }
  }

  public destroy(): void {
    if (this.updateInterval !== null) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.closeExitModal();
    if (this.element.parentElement) {
      this.element.parentElement.removeChild(this.element);
    }
  }
}
