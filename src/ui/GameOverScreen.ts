import { REWARDS } from '../data/rewards';
import { MatchResult } from '../game-modes/VictoryConditions';
import { MatchStats } from '../types';

export class GameOverScreen {
  private element: HTMLElement;

  constructor(
    private parent: HTMLElement,
    private result: MatchResult,
    private isCehennem: boolean,
    private stats: MatchStats,
    private isNewRecord: boolean,
    private bestRecordSec: number,
    private onOpenMarket: () => void,
    private onMainMenu: () => void
  ) {
    this.element = document.createElement('div');
    this.element.className = 'gameover-overlay';

    let titleText = '';
    let titleClass = '';
    let extraSubtitleHtml = '';

    if (this.result === 'exit') {
      titleText = 'YENİLGİ';
      titleClass = 'loss';
      extraSubtitleHtml = `
        <div class="gameover-sub-text">
          Savaştan çıktın: ${REWARDS.exitPenaltyGold} hesap altını kaybettin.
        </div>
      `;
    } else if (this.isCehennem) {
      titleText = 'HAYATTA KALMA';
      titleClass = 'survival';
      const survivalFormatted = this.formatTime(this.stats.survivalTimeSec);
      const bestFormatted = this.formatTime(this.bestRecordSec);

      extraSubtitleHtml = `
        <div class="gameover-sub-text">Hayatta kalma süresi: ${survivalFormatted}</div>
        ${this.isNewRecord ? '<div class="gameover-record-badge">Yeni rekor!</div>' : ''}
        <div class="gameover-sub-text">En uzun hayatta kalma süren: ${bestFormatted}</div>
      `;
    } else {
      if (this.result === 'win') {
        titleText = 'ZAFER';
        titleClass = 'win';
      } else if (this.result === 'loss') {
        titleText = 'YENİLGİ';
        titleClass = 'loss';
      } else {
        titleText = 'BERABERLİK';
        titleClass = 'draw';
      }
    }

    const survivalTimeFormatted = this.formatTime(this.stats.survivalTimeSec);

    this.element.innerHTML = `
      <div class="gameover-box">
        <h1 class="gameover-title ${titleClass}">${titleText}</h1>
        ${extraSubtitleHtml}

        <div class="gameover-stats-grid">
          <div class="gameover-stat-row">
            <span class="gameover-stat-label">Öldürülen düşman askerleri</span>
            <span class="gameover-stat-value">${this.stats.enemySoldiersKilled}</span>
          </div>
          <div class="gameover-stat-row">
            <span class="gameover-stat-label">Kaybedilen dost askerleri</span>
            <span class="gameover-stat-value">${this.stats.friendlySoldiersLost}</span>
          </div>
          <div class="gameover-stat-row">
            <span class="gameover-stat-label">Yıkılan binalar</span>
            <span class="gameover-stat-value">${this.stats.enemyBuildingsDestroyed}</span>
          </div>
          <div class="gameover-stat-row">
            <span class="gameover-stat-label">Toplanan altın</span>
            <span class="gameover-stat-value">${this.stats.goldGathered}</span>
          </div>
          <div class="gameover-stat-row">
            <span class="gameover-stat-label">Toplanan odun</span>
            <span class="gameover-stat-value">${this.stats.woodGathered}</span>
          </div>
          <div class="gameover-stat-row">
            <span class="gameover-stat-label">Üretilen asker sayısı</span>
            <span class="gameover-stat-value">${this.stats.soldiersProduced}</span>
          </div>
          <div class="gameover-stat-row">
            <span class="gameover-stat-label">Hayatta kalma süresi</span>
            <span class="gameover-stat-value">${survivalTimeFormatted}</span>
          </div>
          <div class="gameover-stat-row">
            <span class="gameover-stat-label">Toplam savaş puanı</span>
            <span class="gameover-stat-value">${this.stats.battleScore}</span>
          </div>
          <div class="gameover-stat-row" style="grid-column: span 2;">
            <span class="gameover-stat-label">Kazanılan hesap altını</span>
            <span class="gameover-stat-value" style="color: #fbbf24;">${this.stats.accountGoldEarned}</span>
          </div>
        </div>

        <div class="gameover-actions">
          <button type="button" class="menu-secondary-btn" data-action="market">Markete Git</button>
          <button type="button" class="menu-primary-btn" data-action="menu">Ana Menü</button>
        </div>
      </div>
    `;

    const marketBtn = this.element.querySelector('[data-action="market"]') as HTMLButtonElement;
    const menuBtn = this.element.querySelector('[data-action="menu"]') as HTMLButtonElement;

    marketBtn.addEventListener('click', () => {
      this.onOpenMarket();
    });

    menuBtn.addEventListener('click', () => {
      this.onMainMenu();
    });

    this.parent.appendChild(this.element);
  }

  private formatTime(sec: number): string {
    const totalSec = Math.floor(sec);
    const mm = Math.floor(totalSec / 60)
      .toString()
      .padStart(2, '0');
    const ss = (totalSec % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  }

  public destroy(): void {
    if (this.element.parentElement) {
      this.element.parentElement.removeChild(this.element);
    }
  }
}
