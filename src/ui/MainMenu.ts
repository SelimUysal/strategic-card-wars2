import { AudioManager } from '../audio/AudioManager';
import { AccountManager } from '../progression/AccountManager';
import { SaveManager } from '../progression/SaveManager';

export class MainMenu {
  private static onResetTestProfileCallback: (() => Promise<void> | void) | null = null;
  private element: HTMLElement;
  private audioBtn!: HTMLButtonElement;

  constructor(
    private parent: HTMLElement,
    private accountGold: number,
    private onStartPrep: () => void,
    private onOpenMarket: () => void,
    isTestMode?: boolean,
    private onResetTestProfile?: () => Promise<void> | void
  ) {
    const activeTestMode = isTestMode !== undefined ? isTestMode : SaveManager.isTestMode();
    const isMuted = AudioManager.getInstance().getMuted();

    this.element = document.createElement('div');
    this.element.className = 'main-menu-overlay';

    this.element.innerHTML = `
      <div class="main-menu-card">
        <h1 class="main-menu-title">Kart Tabanlı Strateji Oyunu</h1>
        <div class="main-menu-gold">Hesap Altını: ${this.accountGold}</div>
        <div class="main-menu-buttons">
          <button type="button" class="menu-primary-btn" data-action="prep">Sefer Hazırlığı</button>
          <button type="button" class="menu-secondary-btn" data-action="market">Market</button>
          <button type="button" class="menu-secondary-btn" data-action="toggle-audio">Ses: ${isMuted ? 'Kapalı' : 'Açık'}</button>
          ${activeTestMode ? `<button type="button" class="menu-reset-test-btn" data-action="reset-test">Test Profilini Sıfırla</button>` : ''}
        </div>
      </div>
    `;

    // Menü müziği çal (SPEC S3)
    AudioManager.getInstance().playMusic('muzik_menu');

    const prepBtn = this.element.querySelector('[data-action="prep"]') as HTMLButtonElement;
    const marketBtn = this.element.querySelector('[data-action="market"]') as HTMLButtonElement;
    this.audioBtn = this.element.querySelector('[data-action="toggle-audio"]') as HTMLButtonElement;

    prepBtn.addEventListener('click', () => {
      AudioManager.getInstance().playSfx('sfx_tikla');
      this.onStartPrep();
    });

    marketBtn.addEventListener('click', () => {
      AudioManager.getInstance().playSfx('sfx_tikla');
      this.onOpenMarket();
    });

    // SPEC S7: Ses düğmesi
    this.audioBtn.addEventListener('click', async () => {
      AudioManager.getInstance().playSfx('sfx_tikla');
      const newMuted = !AudioManager.getInstance().getMuted();
      AudioManager.getInstance().setMuted(newMuted);
      this.audioBtn.textContent = `Ses: ${newMuted ? 'Kapalı' : 'Açık'}`;

      const acc = AccountManager.getInstance();
      if (acc) {
        await acc.setAudioMuted(newMuted);
      }
    });

    if (activeTestMode) {
      const resetBtn = this.element.querySelector('[data-action="reset-test"]') as HTMLButtonElement | null;
      if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
          AudioManager.getInstance().playSfx('sfx_tikla');
          resetBtn.disabled = true;
          try {
            if (this.onResetTestProfile) {
              await this.onResetTestProfile();
            } else if (MainMenu.onResetTestProfileCallback) {
              await MainMenu.onResetTestProfileCallback();
            } else {
              const acc = AccountManager.getInstance();
              if (acc) {
                const prof = await acc.resetTestProfile();
                this.setGold(prof.accountGold);
              }
            }
          } catch (err) {
            console.error('Test profili sıfırlama hatası:', err);
          } finally {
            resetBtn.disabled = false;
          }
        });
      }
    }

    this.parent.appendChild(this.element);
  }

  public static setOnResetTestProfile(cb: (() => Promise<void> | void) | null): void {
    MainMenu.onResetTestProfileCallback = cb;
  }

  public setGold(gold: number): void {
    this.accountGold = gold;
    const goldEl = this.element.querySelector('.main-menu-gold');
    if (goldEl) {
      goldEl.textContent = `Hesap Altını: ${this.accountGold}`;
    }
  }

  public destroy(): void {
    if (this.element.parentElement) {
      this.element.parentElement.removeChild(this.element);
    }
  }
}
