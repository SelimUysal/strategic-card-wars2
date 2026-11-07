export class MainMenu {
  private element: HTMLElement;

  constructor(
    private parent: HTMLElement,
    private accountGold: number,
    private onStartPrep: () => void,
    private onOpenMarket: () => void
  ) {
    this.element = document.createElement('div');
    this.element.className = 'main-menu-overlay';

    this.element.innerHTML = `
      <div class="main-menu-card">
        <h1 class="main-menu-title">Kart Tabanlı Strateji Oyunu</h1>
        <div class="main-menu-gold">Hesap Altını: ${this.accountGold}</div>
        <div class="main-menu-buttons">
          <button type="button" class="menu-primary-btn" data-action="prep">Sefer Hazırlığı</button>
          <button type="button" class="menu-secondary-btn" data-action="market">Market</button>
        </div>
      </div>
    `;

    const prepBtn = this.element.querySelector('[data-action="prep"]') as HTMLButtonElement;
    const marketBtn = this.element.querySelector('[data-action="market"]') as HTMLButtonElement;

    prepBtn.addEventListener('click', () => {
      this.onStartPrep();
    });

    marketBtn.addEventListener('click', () => {
      this.onOpenMarket();
    });

    this.parent.appendChild(this.element);
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
