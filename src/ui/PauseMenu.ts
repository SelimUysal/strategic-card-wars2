import { AudioManager } from '../audio/AudioManager';
import { EventManager } from '../core/EventManager';
import { TimeManager } from '../core/TimeManager';
import { REWARDS } from '../data/rewards';
import { AccountManager } from '../progression/AccountManager';
import { RewardManager } from '../progression/RewardManager';

export class PauseMenu {
  private element: HTMLElement | null = null;
  private confirmModalEl: HTMLElement | null = null;
  private onGamePausedBound: () => void;
  private onGameResumedBound: () => void;
  private onKeyDownBound: (e: KeyboardEvent) => void;

  constructor(
    private parent: HTMLElement,
    private timeManager: TimeManager,
    private rewardManager: RewardManager | null,
    private eventManager: EventManager
  ) {
    this.onGamePausedBound = () => this.show();
    this.onGameResumedBound = () => this.hide();
    this.onKeyDownBound = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (this.confirmModalEl) {
          this.closeConfirmModal();
        } else if (this.element && this.element.style.display === 'flex') {
          this.timeManager.resume();
        } else {
          this.timeManager.pause();
        }
      }
    };

    this.eventManager.on('gamePaused', this.onGamePausedBound);
    this.eventManager.on('gameResumed', this.onGameResumedBound);
    window.addEventListener('keydown', this.onKeyDownBound);
  }

  public show(): void {
    AudioManager.getInstance().playSfx('sfx_duraklat');
    AudioManager.getInstance().setGamePaused(true);

    if (this.element) {
      this.element.style.display = 'flex';
      this.updateAudioBtnText();
      return;
    }

    const isMuted = AudioManager.getInstance().getMuted();

    this.element = document.createElement('div');
    this.element.className = 'pause-modal-overlay';
    this.element.innerHTML = `
      <div class="pause-modal-box">
        <div class="pause-modal-title">DURAKLATILDI</div>
        <div class="pause-modal-buttons">
          <button type="button" class="menu-primary-btn" data-action="resume">Devam Et</button>
          <button type="button" class="menu-secondary-btn" data-action="toggle-audio">Ses: ${isMuted ? 'Kapalı' : 'Açık'}</button>
          <button type="button" class="menu-reset-test-btn" data-action="exit-match">Maçtan Çık</button>
        </div>
      </div>
    `;

    const resumeBtn = this.element.querySelector('[data-action="resume"]') as HTMLButtonElement;
    const audioBtn = this.element.querySelector('[data-action="toggle-audio"]') as HTMLButtonElement;
    const exitBtn = this.element.querySelector('[data-action="exit-match"]') as HTMLButtonElement;

    resumeBtn.addEventListener('click', () => {
      AudioManager.getInstance().playSfx('sfx_devam');
      this.timeManager.resume();
    });

    audioBtn.addEventListener('click', async () => {
      AudioManager.getInstance().playSfx('sfx_tikla');
      const newMuted = !AudioManager.getInstance().getMuted();
      AudioManager.getInstance().setMuted(newMuted);
      audioBtn.textContent = `Ses: ${newMuted ? 'Kapalı' : 'Açık'}`;

      const acc = AccountManager.getInstance();
      if (acc) {
        await acc.setAudioMuted(newMuted);
      }
    });

    exitBtn.addEventListener('click', () => {
      AudioManager.getInstance().playSfx('sfx_tikla');
      this.openConfirmModal();
    });

    this.parent.appendChild(this.element);
  }

  public hide(): void {
    AudioManager.getInstance().setGamePaused(false);
    this.closeConfirmModal();
    if (this.element) {
      this.element.style.display = 'none';
    }
  }

  private updateAudioBtnText(): void {
    if (!this.element) return;
    const audioBtn = this.element.querySelector('[data-action="toggle-audio"]') as HTMLButtonElement | null;
    if (audioBtn) {
      const isMuted = AudioManager.getInstance().getMuted();
      audioBtn.textContent = `Ses: ${isMuted ? 'Kapalı' : 'Açık'}`;
    }
  }

  private openConfirmModal(): void {
    if (this.confirmModalEl) return;

    this.confirmModalEl = document.createElement('div');
    this.confirmModalEl.className = 'hud-modal-overlay';
    this.confirmModalEl.innerHTML = `
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

    const confirmBtn = this.confirmModalEl.querySelector('[data-action="confirm-exit"]') as HTMLButtonElement;
    const cancelBtn = this.confirmModalEl.querySelector('[data-action="cancel-exit"]') as HTMLButtonElement;

    confirmBtn.addEventListener('click', async () => {
      AudioManager.getInstance().playSfx('sfx_tikla');
      this.closeConfirmModal();
      this.hide();
      if (this.rewardManager) {
        await this.rewardManager.exitMatch();
      }
    });

    cancelBtn.addEventListener('click', () => {
      AudioManager.getInstance().playSfx('sfx_tikla');
      this.closeConfirmModal();
    });

    this.parent.appendChild(this.confirmModalEl);
  }

  private closeConfirmModal(): void {
    if (this.confirmModalEl && this.confirmModalEl.parentElement) {
      this.confirmModalEl.parentElement.removeChild(this.confirmModalEl);
      this.confirmModalEl = null;
    }
  }

  public destroy(): void {
    this.closeConfirmModal();
    this.eventManager.off('gamePaused', this.onGamePausedBound);
    this.eventManager.off('gameResumed', this.onGameResumedBound);
    window.removeEventListener('keydown', this.onKeyDownBound);

    if (this.element && this.element.parentElement) {
      this.element.parentElement.removeChild(this.element);
      this.element = null;
    }
  }
}
