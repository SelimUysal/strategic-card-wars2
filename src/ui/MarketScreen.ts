import { CurrencyManager } from '../progression/CurrencyManager';
import { MarketManager } from '../progression/MarketManager';

export class MarketScreen {
  private element: HTMLElement;
  private goldEl!: HTMLElement;
  private cardsGridEl!: HTMLElement;
  private commandersGridEl!: HTMLElement;

  constructor(
    private parent: HTMLElement,
    private marketManager: MarketManager,
    private currencyManager: CurrencyManager,
    private onBack: () => void
  ) {
    this.element = document.createElement('div');
    this.element.className = 'fullscreen-screen-overlay';

    this.element.innerHTML = `
      <div class="market-container">
        <div class="market-header">
          <h1 class="market-title">MARKET</h1>
          <div class="market-gold-badge" data-field="gold">Hesap Altını: 0</div>
          <button type="button" class="menu-secondary-btn" data-action="back">Geri</button>
        </div>

        <!-- Kartlar -->
        <div class="market-section">
          <h2 class="market-section-title">Kartlar</h2>
          <div class="market-items-grid" data-field="cards-grid"></div>
        </div>

        <!-- Komutanlar -->
        <div class="market-section">
          <h2 class="market-section-title">Komutanlar</h2>
          <div class="market-items-grid" data-field="commanders-grid"></div>
        </div>
      </div>
    `;

    this.goldEl = this.element.querySelector('[data-field="gold"]') as HTMLElement;
    this.cardsGridEl = this.element.querySelector('[data-field="cards-grid"]') as HTMLElement;
    this.commandersGridEl = this.element.querySelector('[data-field="commanders-grid"]') as HTMLElement;

    const backBtn = this.element.querySelector('[data-action="back"]') as HTMLButtonElement;
    backBtn.addEventListener('click', () => {
      this.onBack();
    });

    this.render();
    this.parent.appendChild(this.element);
  }

  public render(): void {
    const currentGold = this.currencyManager.getGold();
    this.goldEl.textContent = `Hesap Altını: ${currentGold}`;

    // 1. Kartlar
    this.cardsGridEl.innerHTML = '';
    const cards = this.marketManager.getCardsMarket();

    for (const item of cards) {
      const cardEl = document.createElement('div');
      cardEl.className = 'market-item-card';

      const canAfford = currentGold >= item.price;

      cardEl.innerHTML = `
        <div>
          <div class="market-item-name">${item.card.nameTr}</div>
          <div class="market-item-desc">${item.card.roleTr}</div>
        </div>
        <div class="market-item-footer">
          <div class="market-item-price">${item.price} altın</div>
          <div data-field="action-container"></div>
        </div>
      `;

      const actionContainer = cardEl.querySelector('[data-field="action-container"]') as HTMLElement;

      if (item.owned) {
        actionContainer.innerHTML = `<span class="market-item-status-owned">Açık</span>`;
      } else {
        const buyBtn = document.createElement('button');
        buyBtn.type = 'button';
        buyBtn.className = 'market-buy-btn';

        if (!canAfford) {
          buyBtn.disabled = true;
          buyBtn.classList.add('disabled');
          buyBtn.textContent = 'Yetersiz altın';
        } else {
          buyBtn.textContent = 'Satın Al';
          buyBtn.addEventListener('click', async () => {
            const res = await this.marketManager.buyCard(item.card.id);
            if (res.ok) {
              this.render();
            }
          });
        }

        actionContainer.appendChild(buyBtn);
      }

      this.cardsGridEl.appendChild(cardEl);
    }

    // 2. Komutanlar
    this.commandersGridEl.innerHTML = '';
    const commanders = this.marketManager.getCommandersMarket();

    for (const item of commanders) {
      const cmdEl = document.createElement('div');
      cmdEl.className = 'market-item-card';

      const canAfford = currentGold >= item.price;

      cmdEl.innerHTML = `
        <div>
          <div class="market-item-name">${item.commander.nameTr}</div>
          <div class="market-item-desc">${item.commander.abilityNameTr} – ${item.commander.bonusTextTr}</div>
        </div>
        <div class="market-item-footer">
          <div class="market-item-price">${item.price} altın</div>
          <div data-field="action-container"></div>
        </div>
      `;

      const actionContainer = cmdEl.querySelector('[data-field="action-container"]') as HTMLElement;

      if (item.owned) {
        actionContainer.innerHTML = `<span class="market-item-status-owned">Açık</span>`;
      } else {
        const buyBtn = document.createElement('button');
        buyBtn.type = 'button';
        buyBtn.className = 'market-buy-btn';

        if (!canAfford) {
          buyBtn.disabled = true;
          buyBtn.classList.add('disabled');
          buyBtn.textContent = 'Yetersiz altın';
        } else {
          buyBtn.textContent = 'Satın Al';
          buyBtn.addEventListener('click', async () => {
            const res = await this.marketManager.buyCommander(item.commander.id);
            if (res.ok) {
              this.render();
            }
          });
        }

        actionContainer.appendChild(buyBtn);
      }

      this.commandersGridEl.appendChild(cmdEl);
    }
  }

  public destroy(): void {
    if (this.element.parentElement) {
      this.element.parentElement.removeChild(this.element);
    }
  }
}
