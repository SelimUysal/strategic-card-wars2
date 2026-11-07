import { CollectionManager } from '../cards/CollectionManager';
import { DeckManager } from '../cards/DeckManager';
import { CARDS } from '../data/cards';
import { COMMANDERS } from '../data/commanders';
import { DIFFICULTIES } from '../data/difficulties';
import { MAPS } from '../data/maps';
import { AccountManager } from '../progression/AccountManager';
import { CommanderId, DifficultyId, MapId } from '../types';

export class PrepScreen {
  private element: HTMLElement;
  private selectedMap: MapId = 'rumeli_ovasi';
  private selectedDifficulty: DifficultyId = 'kolay';
  private selectedCommander: CommanderId | null = 'fatih';

  private subtitleEl!: HTMLElement;
  private deckGridEl!: HTMLElement;
  private mapGridEl!: HTMLElement;
  private mapDetailEl!: HTMLElement;
  private diffGridEl!: HTMLElement;
  private cmdSectionEl!: HTMLElement;
  private startBtn!: HTMLButtonElement;

  constructor(
    private parent: HTMLElement,
    private deckManager: DeckManager,
    private collectionManager: CollectionManager,
    private accountManager: AccountManager,
    private onStartMatch: (mapId: MapId, difficultyId: DifficultyId, commanderId: CommanderId | null) => void,
    private onOpenMarket: () => void,
    private onBack: () => void
  ) {
    this.element = document.createElement('div');
    this.element.className = 'fullscreen-screen-overlay';

    this.element.innerHTML = `
      <div class="prep-container">
        <div class="prep-header">
          <h1 class="prep-main-title">SEFER HAZIRLIĞI</h1>
          <p class="prep-sub-title" data-field="subtitle">İslam Halifeliği – Savaş meydanını seç.</p>
        </div>

        <!-- a) Deste -->
        <div class="prep-section">
          <div class="prep-section-title">
            <span>Deste (en fazla 5 kart)</span>
            <button type="button" class="hud-btn" data-action="open-market">Market</button>
          </div>
          <div class="prep-grid" data-field="deck-grid"></div>
        </div>

        <!-- b) Harita -->
        <div class="prep-section">
          <h2 class="prep-section-title">Harita</h2>
          <div class="prep-grid" data-field="map-grid"></div>
          <div class="prep-detail-box" data-field="map-detail"></div>
        </div>

        <!-- c) Zorluk -->
        <div class="prep-section">
          <h2 class="prep-section-title">Zorluk</h2>
          <div class="prep-grid" data-field="diff-grid" style="grid-template-columns: 1fr;"></div>
        </div>

        <!-- d) Komutan -->
        <div class="prep-section" data-field="cmd-section">
          <h2 class="prep-section-title">Komutan</h2>
          <div class="prep-grid" data-field="cmd-grid"></div>
          <div class="prep-detail-box" data-field="cmd-detail"></div>
        </div>

        <!-- e) Başla ve Geri düğmeleri -->
        <div class="prep-actions-bar">
          <button type="button" class="menu-secondary-btn" data-action="back">Geri</button>
          <button type="button" class="btn-start" data-action="start">Başla</button>
        </div>
      </div>
    `;

    this.subtitleEl = this.element.querySelector('[data-field="subtitle"]') as HTMLElement;
    this.deckGridEl = this.element.querySelector('[data-field="deck-grid"]') as HTMLElement;
    this.mapGridEl = this.element.querySelector('[data-field="map-grid"]') as HTMLElement;
    this.mapDetailEl = this.element.querySelector('[data-field="map-detail"]') as HTMLElement;
    this.diffGridEl = this.element.querySelector('[data-field="diff-grid"]') as HTMLElement;
    this.cmdSectionEl = this.element.querySelector('[data-field="cmd-section"]') as HTMLElement;
    this.startBtn = this.element.querySelector('[data-action="start"]') as HTMLButtonElement;

    const marketBtn = this.element.querySelector('[data-action="open-market"]') as HTMLButtonElement;
    marketBtn.addEventListener('click', () => {
      this.onOpenMarket();
    });

    const backBtn = this.element.querySelector('[data-action="back"]') as HTMLButtonElement;
    backBtn.addEventListener('click', () => {
      this.onBack();
    });

    this.startBtn.addEventListener('click', () => {
      if (!this.startBtn.disabled) {
        const cmd = this.selectedDifficulty === 'cehennem' ? null : this.selectedCommander;
        this.onStartMatch(this.selectedMap, this.selectedDifficulty, cmd);
      }
    });

    this.renderDeck();
    this.renderMaps();
    this.renderDifficulties();
    this.renderCommanders();
    this.updateState();

    this.parent.appendChild(this.element);
  }

  private renderDeck(): void {
    this.deckGridEl.innerHTML = '';
    const currentDeck = this.deckManager.getDeck();

    for (const card of Object.values(CARDS)) {
      const isUnlocked = this.collectionManager.isCardUnlocked(card.id);
      const isInDeck = currentDeck.includes(card.id);

      const cardEl = document.createElement('div');
      cardEl.className = 'prep-option-card';
      if (!isUnlocked) {
        cardEl.classList.add('locked');
      } else if (isInDeck) {
        cardEl.classList.add('selected');
      }

      cardEl.innerHTML = `
        <div>
          <div class="prep-option-title">${card.nameTr}</div>
          <div class="prep-option-sub">${card.roleTr}</div>
        </div>
        <div class="prep-option-sub">
          ${isUnlocked ? (isInDeck ? 'Destede' : 'Desteye Ekle') : 'Marketten açılır'}
        </div>
      `;

      if (isUnlocked) {
        cardEl.addEventListener('click', async () => {
          const deck = this.deckManager.getDeck();
          if (isInDeck) {
            if (deck.length > 1) {
              const nextDeck = deck.filter((id) => id !== card.id);
              this.deckManager.setDeck(nextDeck);
              await this.accountManager.save();
              this.renderDeck();
            }
          } else {
            if (deck.length < 5) {
              this.deckManager.setDeck([...deck, card.id]);
              await this.accountManager.save();
              this.renderDeck();
            }
          }
        });
      }

      this.deckGridEl.appendChild(cardEl);
    }
  }

  private renderMaps(): void {
    this.mapGridEl.innerHTML = '';
    const mapKeys: MapId[] = ['rumeli_ovasi', 'tuna_gecidi', 'karpat_daglari', 'viyana_ovasi'];

    for (const key of mapKeys) {
      const mapDef = MAPS[key];
      if (!mapDef) continue;

      const mapEl = document.createElement('div');
      mapEl.className = 'prep-option-card';
      if (this.selectedMap === key) {
        mapEl.classList.add('selected');
      }

      mapEl.innerHTML = `
        <div class="prep-option-title">${mapDef.nameTr}</div>
      `;

      mapEl.addEventListener('click', () => {
        this.selectedMap = key;
        this.renderMaps();
        this.updateState();
      });

      this.mapGridEl.appendChild(mapEl);
    }

    const currentMapDef = MAPS[this.selectedMap];
    if (currentMapDef) {
      this.mapDetailEl.innerHTML = `
        <strong>Tema:</strong> ${currentMapDef.themeTr}<br/>
        <strong>Savaş Tarzı:</strong> ${currentMapDef.battleStyleTr}
      `;
    }
  }

  private renderDifficulties(): void {
    this.diffGridEl.innerHTML = '';
    const diffKeys: DifficultyId[] = ['kolay', 'normal', 'zor', 'cehennem'];

    for (const key of diffKeys) {
      const diffDef = DIFFICULTIES[key];
      if (!diffDef) continue;

      const rowEl = document.createElement('div');
      rowEl.className = 'prep-option-card';
      if (this.selectedDifficulty === key) {
        rowEl.classList.add('selected');
      }

      const rewardText =
        diffDef.rewardGold !== null && diffDef.rewardGold !== undefined
          ? `${diffDef.rewardGold} altın ödül.`
          : 'Hayatta kalma ödülü.';

      rowEl.innerHTML = `
        <div class="prep-option-title">${diffDef.labelTr}: ${rewardText}</div>
      `;

      rowEl.addEventListener('click', () => {
        this.selectedDifficulty = key;
        this.renderDifficulties();
        this.renderCommanders();
        this.updateState();
      });

      this.diffGridEl.appendChild(rowEl);
    }
  }

  private renderCommanders(): void {
    const isCehennem = this.selectedDifficulty === 'cehennem';

    if (isCehennem) {
      this.cmdSectionEl.innerHTML = `
        <h2 class="prep-section-title">Komutan</h2>
        <div class="prep-detail-box">Cehennem modunda komutan yoktur.</div>
      `;
      return;
    }

    this.cmdSectionEl.innerHTML = `
      <h2 class="prep-section-title">Komutan</h2>
      <div class="prep-grid" data-field="cmd-grid"></div>
      <div class="prep-detail-box" data-field="cmd-detail"></div>
    `;

    const cmdGridEl = this.cmdSectionEl.querySelector('[data-field="cmd-grid"]') as HTMLElement;
    const cmdDetailEl = this.cmdSectionEl.querySelector('[data-field="cmd-detail"]') as HTMLElement;

    for (const cmd of Object.values(COMMANDERS)) {
      const isUnlocked = this.collectionManager.isCommanderUnlocked(cmd.id);
      const isSelected = this.selectedCommander === cmd.id;

      const cmdEl = document.createElement('div');
      cmdEl.className = 'prep-option-card';
      if (!isUnlocked) {
        cmdEl.classList.add('locked');
      } else if (isSelected) {
        cmdEl.classList.add('selected');
      }

      cmdEl.innerHTML = `
        <div>
          <div class="prep-option-title">${cmd.nameTr}</div>
          <div class="prep-option-sub">${cmd.abilityNameTr}</div>
        </div>
        <div class="prep-option-sub">
          ${isUnlocked ? (isSelected ? 'Seçili' : 'Seç') : 'Marketten açılır'}
        </div>
      `;

      if (isUnlocked) {
        cmdEl.addEventListener('click', () => {
          this.selectedCommander = cmd.id;
          this.renderCommanders();
          this.updateState();
        });
      }

      cmdGridEl.appendChild(cmdEl);
    }

    if (this.selectedCommander) {
      const currentCmd = COMMANDERS[this.selectedCommander];
      if (currentCmd) {
        cmdDetailEl.innerHTML = `<strong>${currentCmd.abilityNameTr}:</strong> ${currentCmd.bonusTextTr}`;
      }
    }
  }

  private updateState(): void {
    // Alt başlık güncellemesi
    if (this.selectedDifficulty === 'cehennem') {
      this.subtitleEl.textContent = 'Batı Roma – Savaş meydanını seç.';
    } else {
      this.subtitleEl.textContent = 'İslam Halifeliği – Savaş meydanını seç.';
    }

    // Başla düğmesi kontrolü (harita ve zorluk seçilmeden pasif)
    const canStart = Boolean(this.selectedMap && this.selectedDifficulty);
    this.startBtn.disabled = !canStart;
    if (canStart) {
      this.startBtn.classList.remove('disabled');
    } else {
      this.startBtn.classList.add('disabled');
    }
  }

  public refresh(): void {
    this.renderDeck();
    this.renderCommanders();
    this.updateState();
  }

  public destroy(): void {
    if (this.element.parentElement) {
      this.element.parentElement.removeChild(this.element);
    }
  }
}
