import { AudioManager } from '../audio/AudioManager';
import { CollectionManager } from '../cards/CollectionManager';
import { DeckManager } from '../cards/DeckManager';
import { CARDS, DEFAULT_DECK } from '../data/cards';
import { COMMANDERS } from '../data/commanders';
import { DIFFICULTIES } from '../data/difficulties';
import { MAPS } from '../data/maps';
import { UNITS } from '../data/units';
import { BUILDINGS } from '../data/buildings';
import { AccountManager } from '../progression/AccountManager';
import { CardId, CommanderId, DifficultyId, MapId, UnitId } from '../types';
import { UnitOverlay } from './UnitOverlay';

export class PrepScreen {
  private element: HTMLElement;
  private selectedMap: MapId = 'rumeli_ovasi';
  private selectedDifficulty: DifficultyId = 'kolay';
  private selectedCommander: CommanderId | null = 'fatih';

  private selectedCategory: 'all' | 'asker' | 'savunma' = 'all';

  private subtitleEl!: HTMLElement;
  private deckCounterEl!: HTMLElement;
  private deckWarningEl!: HTMLElement;
  private deckSlotsEl!: HTMLElement;
  private collectionGridEl!: HTMLElement;
  private mapGridEl!: HTMLElement;
  private mapDetailEl!: HTMLElement;
  private diffGridEl!: HTMLElement;
  private cmdSectionEl!: HTMLElement;
  private startBtn!: HTMLButtonElement;

  // Drag & Drop State
  private dragGhostEl: HTMLElement | null = null;
  private activeDragSource: { type: 'collection' | 'slot'; cardId: CardId; index?: number } | null = null;
  private isPointerDown = false;
  private pointerStartX = 0;
  private pointerStartY = 0;
  private isDragging = false;

  constructor(
    private parent: HTMLElement,
    private deckManager: DeckManager,
    private collectionManager: CollectionManager,
    private accountManager: AccountManager,
    private onStartMatch: (mapId: MapId, difficultyId: DifficultyId, commanderId: CommanderId | null) => void,
    private onOpenMarket: () => void,
    private onBack: () => void
  ) {
    // Menü müziği çal (SPEC S3)
    AudioManager.getInstance().playMusic('muzik_menu');

    this.element = document.createElement('div');
    this.element.className = 'fullscreen-screen-overlay';

    this.element.innerHTML = `
      <div class="prep-container">
        <div class="prep-header">
          <h1 class="prep-main-title">SEFER HAZIRLIĞI</h1>
          <p class="prep-sub-title" data-field="subtitle">İslam Halifeliği – Savaş meydanını seç.</p>
        </div>

        <!-- a) Deste Bölümü (R17) -->
        <div class="prep-section prep-deck-section">
          <div class="prep-section-title">
            <div class="prep-deck-header-left">
              <span>Deste</span>
              <span class="prep-deck-counter" data-field="deck-counter">Deste: 0 / 5</span>
            </div>
            <div class="prep-deck-header-actions">
              <button type="button" class="menu-secondary-btn prep-btn-sm" data-action="default-deck">Varsayılan Deste</button>
              <button type="button" class="hud-btn" data-action="open-market">Market</button>
            </div>
          </div>

          <!-- Deste Uyarı Alanı (S4) -->
          <div class="prep-warning-banner" data-field="deck-warning" style="display: none;"></div>

          <!-- 5 Deste Yuvası (S1) -->
          <div class="prep-deck-slots-container" data-field="deck-slots"></div>

          <!-- Koleksiyon Başlık & Filtre Sekmeleri (S1) -->
          <div class="prep-collection-header">
            <span class="prep-collection-title">Kart Koleksiyonu</span>
            <div class="prep-filter-tabs">
              <button type="button" class="prep-filter-tab active" data-filter="all">Hepsi</button>
              <button type="button" class="prep-filter-tab" data-filter="asker">Asker</button>
              <button type="button" class="prep-filter-tab" data-filter="savunma">Savunma</button>
            </div>
          </div>

          <!-- Koleksiyon Kart Grid'i (S1) -->
          <div class="prep-grid" data-field="collection-grid"></div>
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
    this.deckCounterEl = this.element.querySelector('[data-field="deck-counter"]') as HTMLElement;
    this.deckWarningEl = this.element.querySelector('[data-field="deck-warning"]') as HTMLElement;
    this.deckSlotsEl = this.element.querySelector('[data-field="deck-slots"]') as HTMLElement;
    this.collectionGridEl = this.element.querySelector('[data-field="collection-grid"]') as HTMLElement;
    this.mapGridEl = this.element.querySelector('[data-field="map-grid"]') as HTMLElement;
    this.mapDetailEl = this.element.querySelector('[data-field="map-detail"]') as HTMLElement;
    this.diffGridEl = this.element.querySelector('[data-field="diff-grid"]') as HTMLElement;
    this.cmdSectionEl = this.element.querySelector('[data-field="cmd-section"]') as HTMLElement;
    this.startBtn = this.element.querySelector('[data-action="start"]') as HTMLButtonElement;

    // Filtre sekmeleri
    const filterTabs = this.element.querySelectorAll('.prep-filter-tab');
    filterTabs.forEach((tab) => {
      tab.addEventListener('click', (e) => {
        AudioManager.getInstance().playSfx('sfx_tikla');
        const btn = e.currentTarget as HTMLButtonElement;
        const filter = btn.dataset.filter as 'all' | 'asker' | 'savunma';
        this.selectedCategory = filter;
        filterTabs.forEach((t) => t.classList.remove('active'));
        btn.classList.add('active');
        this.renderCollectionGrid();
      });
    });

    // Varsayılan Deste düğmesi (SPEC S5)
    const defaultDeckBtn = this.element.querySelector('[data-action="default-deck"]') as HTMLButtonElement;
    defaultDeckBtn.addEventListener('click', async () => {
      AudioManager.getInstance().playSfx('sfx_kart_sec');
      this.deckManager.loadDeck(DEFAULT_DECK);
      await this.accountManager.save();
      this.renderDeck();
      this.updateState();
    });

    const marketBtn = this.element.querySelector('[data-action="open-market"]') as HTMLButtonElement;
    marketBtn.addEventListener('click', () => {
      AudioManager.getInstance().playSfx('sfx_tikla');
      this.onOpenMarket();
    });

    const backBtn = this.element.querySelector('[data-action="back"]') as HTMLButtonElement;
    backBtn.addEventListener('click', () => {
      AudioManager.getInstance().playSfx('sfx_tikla');
      this.onBack();
    });

    this.startBtn.addEventListener('click', () => {
      AudioManager.getInstance().playSfx('sfx_tikla');
      if (!this.startBtn.disabled) {
        const cmd = this.selectedDifficulty === 'cehennem' ? null : this.selectedCommander;
        this.onStartMatch(this.selectedMap, this.selectedDifficulty, cmd);
      }
    });

    // Global drag dinleyicileri
    this.initGlobalDragListeners();

    this.renderDeck();
    this.renderMaps();
    this.renderDifficulties();
    this.renderCommanders();
    this.updateState();

    this.parent.appendChild(this.element);
  }

  // S1, S2, S4, S5, S6: Deste Görünümü ve Etkileşimleri
  private renderDeck(): void {
    const currentDeck = this.deckManager.getDeck();
    this.deckCounterEl.textContent = `Deste: ${currentDeck.length} / 5`;

    // 1. 5 Deste Yuvası Çizimi (S1)
    this.deckSlotsEl.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const slotCardId = currentDeck[i] as CardId | undefined;
      const slotEl = document.createElement('div');
      slotEl.className = 'prep-slot-card';
      slotEl.dataset.slotIndex = i.toString();

      if (slotCardId && CARDS[slotCardId]) {
        const cardDef = CARDS[slotCardId];
        slotEl.innerHTML = `
          <div class="prep-slot-header">
            <span class="prep-slot-number">#${i + 1}</span>
          </div>
          <div class="prep-slot-icon">${this.getCardIconHtml(slotCardId)}</div>
          <div class="prep-slot-info">
            <div class="prep-slot-name">${cardDef.nameTr}</div>
            <div class="prep-slot-role">${cardDef.roleTr}</div>
          </div>
        `;

        // Yuva üzerine pointerdown (sürükleme veya tıklama)
        this.attachCardPointerEvents(slotEl, { type: 'slot', cardId: slotCardId, index: i });
      } else {
        slotEl.classList.add('empty');
        slotEl.innerHTML = `
          <div class="prep-slot-header">
            <span class="prep-slot-number">#${i + 1}</span>
          </div>
          <div class="prep-slot-empty-text">Boş yuva</div>
        `;
      }

      this.deckSlotsEl.appendChild(slotEl);
    }

    // 2. Koleksiyon Kart Grid'i Çizimi (S1)
    this.renderCollectionGrid();
  }

  private renderCollectionGrid(): void {
    this.collectionGridEl.innerHTML = '';
    const currentDeck = this.deckManager.getDeck();

    for (const card of Object.values(CARDS)) {
      if (this.selectedCategory !== 'all' && card.category !== this.selectedCategory) {
        continue;
      }

      const isUnlocked = this.collectionManager.isCardUnlocked(card.id);
      const isInDeck = currentDeck.includes(card.id);

      const cardEl = document.createElement('div');
      cardEl.className = 'prep-option-card prep-collection-card';
      if (!isUnlocked) {
        cardEl.classList.add('locked');
      } else if (isInDeck) {
        cardEl.classList.add('in-deck');
      }

      cardEl.innerHTML = `
        <div class="prep-card-top-row">
          <div class="prep-card-icon">${this.getCardIconHtml(card.id)}</div>
          <div>
            <div class="prep-option-title">${card.nameTr}</div>
            <div class="prep-option-sub">${card.roleTr}</div>
          </div>
        </div>
        <div class="prep-card-bottom-row">
          ${
            isUnlocked
              ? isInDeck
                ? '<span class="prep-card-badge in-deck-badge">Destede</span>'
                : '<span class="prep-card-badge add-badge">Desteye Ekle</span>'
              : '<span class="prep-card-badge locked-badge">🔒 Marketten açılır</span>'
          }
        </div>
      `;

      // Pointer eventleri ekle
      this.attachCardPointerEvents(cardEl, { type: 'collection', cardId: card.id });

      this.collectionGridEl.appendChild(cardEl);
    }
  }

  // Pointer event yönetimi (Dokunma & Fare Sürükle-Bırak) (SPEC S2)
  private attachCardPointerEvents(
    element: HTMLElement,
    source: { type: 'collection' | 'slot'; cardId: CardId; index?: number }
  ): void {
    element.style.touchAction = 'none';

    element.addEventListener('pointerdown', (e: PointerEvent) => {
      // Sol tık veya dokunma hariç yoksay
      if (e.button !== undefined && e.button !== 0) return;

      this.isPointerDown = true;
      this.pointerStartX = e.clientX;
      this.pointerStartY = e.clientY;
      this.activeDragSource = source;
      this.isDragging = false;
    });
  }

  private initGlobalDragListeners(): void {
    window.addEventListener('pointermove', (e: PointerEvent) => {
      if (!this.isPointerDown || !this.activeDragSource) return;

      const dx = e.clientX - this.pointerStartX;
      const dy = e.clientY - this.pointerStartY;

      if (!this.isDragging && Math.hypot(dx, dy) > 8) {
        // Sürükleme başladı
        const isUnlocked = this.collectionManager.isCardUnlocked(this.activeDragSource.cardId);
        if (this.activeDragSource.type === 'collection' && !isUnlocked) {
          // Kilitli kart sürüklenemez
          this.isPointerDown = false;
          this.activeDragSource = null;
          return;
        }

        this.isDragging = true;
        this.createDragGhost(this.activeDragSource.cardId, e.clientX, e.clientY);
      }

      if (this.isDragging && this.dragGhostEl) {
        this.dragGhostEl.style.left = `${e.clientX}px`;
        this.dragGhostEl.style.top = `${e.clientY}px`;

        // Altındaki yuvayı vurgula
        this.updateSlotHighlights(e.clientX, e.clientY);
      }
    });

    window.addEventListener('pointerup', (e: PointerEvent) => {
      if (!this.isPointerDown) return;

      if (this.isDragging && this.activeDragSource) {
        this.handleDragDrop(e.clientX, e.clientY, this.activeDragSource);
      } else if (!this.isDragging && this.activeDragSource) {
        // Kısa tıklama / dokunma -> Ayrıntı panelini aç (S2a, S3)
        this.openCardDetailModal(this.activeDragSource.cardId);
      }

      this.cleanupDrag();
    });

    window.addEventListener('pointercancel', () => {
      this.cleanupDrag();
    });
  }

  private createDragGhost(cardId: CardId, x: number, y: number): void {
    const cardDef = CARDS[cardId];
    if (!cardDef) return;

    this.dragGhostEl = document.createElement('div');
    this.dragGhostEl.className = 'deck-ghost-card';
    this.dragGhostEl.innerHTML = `
      <div class="prep-slot-icon">${this.getCardIconHtml(cardId)}</div>
      <div class="prep-slot-name">${cardDef.nameTr}</div>
    `;
    this.dragGhostEl.style.left = `${x}px`;
    this.dragGhostEl.style.top = `${y}px`;
    document.body.appendChild(this.dragGhostEl);
  }

  private updateSlotHighlights(x: number, y: number): void {
    const slotElements = this.element.querySelectorAll('.prep-slot-card');
    slotElements.forEach((el) => el.classList.remove('slot-target-highlight'));

    const targetEl = document.elementFromPoint(x, y);
    const slotCard = targetEl?.closest('.prep-slot-card');
    if (slotCard) {
      slotCard.classList.add('slot-target-highlight');
    }
  }

  private async handleDragDrop(
    x: number,
    y: number,
    source: { type: 'collection' | 'slot'; cardId: CardId; index?: number }
  ): Promise<void> {
    const targetEl = document.elementFromPoint(x, y);
    const slotCard = targetEl?.closest('.prep-slot-card') as HTMLElement | null;
    const isInsideSlotsContainer = Boolean(targetEl?.closest('.prep-deck-slots-container'));

    if (slotCard) {
      const targetSlotIndex = parseInt(slotCard.dataset.slotIndex || '0', 10);

      if (source.type === 'collection') {
        const deck = this.deckManager.getDeck();
        if (deck.includes(source.cardId)) {
          // Kart zaten destede -> Sırasını hedef yuvaya taşı
          const fromIndex = deck.indexOf(source.cardId);
          if (fromIndex !== -1 && fromIndex !== targetSlotIndex) {
            this.deckManager.reorder(fromIndex, Math.min(targetSlotIndex, deck.length - 1));
            await this.accountManager.save();
          }
        } else {
          // Kart destede değil -> Eklemeyi dene
          if (deck.length >= 5) {
            this.showToast('Önce desteden bir kart çıkar');
          } else {
            const addRes = this.deckManager.addCard(source.cardId);
            if (addRes.ok) {
              const newDeck = this.deckManager.getDeck();
              if (targetSlotIndex < newDeck.length - 1) {
                this.deckManager.reorder(newDeck.length - 1, targetSlotIndex);
              }
              await this.accountManager.save();
            }
          }
        }
      } else if (source.type === 'slot' && source.index !== undefined) {
        // Yuvalar arası sürükleme (reorder) (S2d)
        const deck = this.deckManager.getDeck();
        const validTargetIndex = Math.min(targetSlotIndex, deck.length - 1);
        if (source.index !== validTargetIndex) {
          this.deckManager.reorder(source.index, validTargetIndex);
          await this.accountManager.save();
        }
      }
    } else if (source.type === 'slot' && source.index !== undefined && !isInsideSlotsContainer) {
      // Yuvadaki kartı yuva dışına bırakmak desteden çıkarır (S2c)
      this.deckManager.removeCardAtIndex(source.index);
      await this.accountManager.save();
    }

    this.renderDeck();
    this.updateState();
  }

  private cleanupDrag(): void {
    if (this.dragGhostEl) {
      this.dragGhostEl.remove();
      this.dragGhostEl = null;
    }
    const slotElements = this.element.querySelectorAll('.prep-slot-card');
    slotElements.forEach((el) => el.classList.remove('slot-target-highlight'));

    this.isPointerDown = false;
    this.activeDragSource = null;
    this.isDragging = false;
  }

  // S3: Veriye Dayalı Ayrıntı Paneli (Modal)
  private openCardDetailModal(cardId: CardId): void {
    const cardDef = CARDS[cardId];
    if (!cardDef) return;

    const isUnlocked = this.collectionManager.isCardUnlocked(cardId);
    const deck = this.deckManager.getDeck();
    const isInDeck = deck.includes(cardId);

    const isUnit = cardDef.refType === 'unit';
    const unitDef = isUnit ? UNITS[cardDef.refId as UnitId] : null;
    const buildingDef = !isUnit ? BUILDINGS[cardDef.refId as keyof typeof BUILDINGS] : null;

    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'hud-modal-overlay deck-detail-modal-overlay';

    let producedAtHtml = '';
    if (isUnit && unitDef) {
      const prodBuilding = BUILDINGS[unitDef.producedAt];
      if (prodBuilding) {
        producedAtHtml = `<div class="deck-detail-produced">Üretim yeri: <strong>${prodBuilding.nameTr}</strong></div>`;
      }
    }

    let statsHtml = '';
    if (isUnit && unitDef) {
      statsHtml = `
        <div class="deck-detail-stat-row"><span>Can:</span> <strong>${unitDef.hp}</strong></div>
        <div class="deck-detail-stat-row"><span>Hasar:</span> <strong>${unitDef.damage}</strong></div>
        <div class="deck-detail-stat-row"><span>Menzil:</span> <strong>${unitDef.range}</strong></div>
        <div class="deck-detail-stat-row"><span>Saldırı hızı:</span> <strong>${unitDef.attackIntervalSec} saniyede 1 saldırı</strong></div>
        <div class="deck-detail-stat-row"><span>Hareket hızı:</span> <strong>${unitDef.moveSpeed}</strong></div>
        <div class="deck-detail-stat-row"><span>Görüş menzili:</span> <strong>${unitDef.vision}</strong></div>
        <div class="deck-detail-stat-row"><span>Üretim süresi:</span> <strong>${unitDef.buildTimeSec} sn</strong></div>
        <div class="deck-detail-stat-row"><span>Altın maliyeti:</span> <strong>${unitDef.costGold} altın</strong></div>
        <div class="deck-detail-stat-row"><span>Odun maliyeti:</span> <strong>${unitDef.costWood} odun</strong></div>
        <div class="deck-detail-stat-row"><span>Nüfus:</span> <strong>${unitDef.pop}</strong></div>
      `;
    } else if (buildingDef) {
      statsHtml = `
        <div class="deck-detail-stat-row"><span>Can:</span> <strong>${buildingDef.hp}</strong></div>
        <div class="deck-detail-stat-row"><span>Hasar:</span> <strong>${buildingDef.damage}</strong></div>
        <div class="deck-detail-stat-row"><span>Menzil:</span> <strong>${buildingDef.range}</strong></div>
        <div class="deck-detail-stat-row"><span>Saldırı hızı:</span> <strong>${buildingDef.attackIntervalSec} saniyede 1 saldırı</strong></div>
        <div class="deck-detail-stat-row"><span>Görüş menzili:</span> <strong>${buildingDef.vision}</strong></div>
        <div class="deck-detail-stat-row"><span>İnşa süresi:</span> <strong>${buildingDef.buildTimeSec} sn</strong></div>
        <div class="deck-detail-stat-row"><span>Altın maliyeti:</span> <strong>${buildingDef.costGold} altın</strong></div>
        <div class="deck-detail-stat-row"><span>Odun maliyeti:</span> <strong>${buildingDef.costWood} odun</strong></div>
      `;

      if (cardId === 'mancinik_i_azam') {
        statsHtml += `
          <div class="deck-detail-stat-row"><span>Alan hasarı:</span> <strong>3 birim</strong></div>
          <div class="deck-detail-stat-row"><span>Ölü bölge:</span> <strong>3 birim</strong></div>
        `;
      }
    }

    // Avantajlar listesi (bonusVs verisinden otomatik) (S3)
    const advantages = this.formatBonusVs(cardId);
    const advantagesHtml = advantages.map((adv) => `<li>${adv}</li>`).join('');

    const desc = unitDef?.descriptionTr || buildingDef?.descriptionTr || '';

    modalOverlay.innerHTML = `
      <div class="hud-modal-box deck-detail-modal-box">
        <div class="deck-detail-modal-header">
          <div class="deck-detail-modal-icon">${this.getCardIconHtml(cardId)}</div>
          <div>
            <h2 class="deck-detail-modal-title">${cardDef.nameTr}</h2>
            <div class="deck-detail-modal-sub">${cardDef.roleTr}</div>
          </div>
        </div>

        <div class="deck-detail-desc">${desc}</div>

        ${producedAtHtml}

        <div class="deck-detail-section-title">İstatistikler</div>
        <div class="deck-detail-stats-grid">
          ${statsHtml}
        </div>

        <div class="deck-detail-section-title">Avantajlar</div>
        <ul class="deck-detail-advantages-list">
          ${advantagesHtml}
        </ul>

        <div class="deck-detail-actions">
          <button type="button" class="hud-modal-btn-cancel" data-action="close">Kapat</button>
          ${
            isUnlocked
              ? isInDeck
                ? `<button type="button" class="hud-btn hud-btn-exit" data-action="toggle-deck">Desteden Çıkar</button>`
                : `<button type="button" class="menu-primary-btn" data-action="toggle-deck">Desteye Ekle</button>`
              : `<button type="button" class="menu-primary-btn disabled" disabled>Marketten açılır</button>`
          }
        </div>
      </div>
    `;

    const closeBtn = modalOverlay.querySelector('[data-action="close"]') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => modalOverlay.remove());

    const toggleBtn = modalOverlay.querySelector('[data-action="toggle-deck"]') as HTMLButtonElement | null;
    if (toggleBtn && isUnlocked) {
      toggleBtn.addEventListener('click', async () => {
        const currentDeck = this.deckManager.getDeck();
        if (isInDeck) {
          this.deckManager.removeCard(cardId);
          await this.accountManager.save();
          modalOverlay.remove();
          this.renderDeck();
          this.updateState();
        } else {
          if (currentDeck.length >= 5) {
            this.showToast('Önce desteden bir kart çıkar');
          } else {
            this.deckManager.addCard(cardId);
            await this.accountManager.save();
            modalOverlay.remove();
            this.renderDeck();
            this.updateState();
          }
        }
      });
    }

    document.body.appendChild(modalOverlay);
  }

  // bonusVs verisinden otomatik avantaj metni üretimi (S3)
  private formatBonusVs(cardId: CardId): string[] {
    const cardDef = CARDS[cardId];
    if (!cardDef) return [];
    const bonusList: Array<{ targetUnitId?: string; targetBuildingId?: string; targetBuildings?: boolean; mult: number }> =
      cardDef.refType === 'unit'
        ? UNITS[cardDef.refId as UnitId]?.bonusVs || []
        : BUILDINGS[cardDef.refId as keyof typeof BUILDINGS]?.bonusVs || [];

    if (bonusList.length === 0) return ['Özel avantajı yok'];

    const results: string[] = [];
    for (const bonus of bonusList) {
      let targetName = '';
      if (bonus.targetUnitId) {
        targetName = UNITS[bonus.targetUnitId as UnitId]?.nameTr || bonus.targetUnitId;
      } else if (bonus.targetBuildingId) {
        targetName = BUILDINGS[bonus.targetBuildingId as keyof typeof BUILDINGS]?.nameTr || bonus.targetBuildingId;
      } else if (bonus.targetBuildings) {
        targetName = 'Binalar';
      }

      if (targetName) {
        const multStr = bonus.mult.toString().replace('.', ',');
        results.push(`${cardDef.nameTr} → ${targetName} x${multStr}`);
      }
    }
    return results.length > 0 ? results : ['Özel avantajı yok'];
  }

  private getCardIconHtml(cardId: CardId): string {
    const cardDef = CARDS[cardId];
    if (!cardDef) return '';
    if (cardDef.refType === 'unit') {
      const url = UnitOverlay.getIconDataUrl(cardDef.refId, 'player');
      return `<img src="${url}" class="prep-card-icon-img" alt="${cardDef.nameTr}" />`;
    } else {
      if (cardId === 'hisar') {
        return `
          <svg class="prep-card-icon-svg" viewBox="0 0 64 64" fill="none" stroke="currentColor">
            <path d="M16 56V24L24 16H40L48 24V56H16Z" fill="#1e293b" stroke="#d4af37" stroke-width="3"/>
            <path d="M20 16V8H26V12H38V8H44V16" stroke="#d4af37" stroke-width="3"/>
            <rect x="26" y="36" width="12" height="20" fill="#0f172a" stroke="#d4af37" stroke-width="2"/>
          </svg>
        `;
      } else {
        return `
          <svg class="prep-card-icon-svg" viewBox="0 0 64 64" fill="none" stroke="currentColor">
            <path d="M12 48L52 48M20 48L32 20M44 48L32 20" stroke="#d4af37" stroke-width="3"/>
            <path d="M16 36L48 16" stroke="#fbbf24" stroke-width="4"/>
            <circle cx="16" cy="36" r="6" fill="#7f1d1d" stroke="#d4af37" stroke-width="2"/>
            <circle cx="16" cy="48" r="4" fill="#334155" stroke="#d4af37" stroke-width="2"/>
            <circle cx="48" cy="48" r="4" fill="#334155" stroke="#d4af37" stroke-width="2"/>
          </svg>
        `;
      }
    }
  }

  private showToast(message: string): void {
    const toast = document.createElement('div');
    toast.className = 'prep-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('visible'), 10);
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 200);
    }, 1500);
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

  // S4: Deste Uyarıları ve Başla Butonu Durumu
  private updateState(): void {
    // Alt başlık güncellemesi
    if (this.selectedDifficulty === 'cehennem') {
      this.subtitleEl.textContent = 'Batı Roma – Savaş meydanını seç.';
    } else {
      this.subtitleEl.textContent = 'İslam Halifeliği – Savaş meydanını seç.';
    }

    const deck = this.deckManager.getDeck();

    // Deste kontrolü ve uyarılar (S4)
    if (deck.length === 0) {
      this.deckWarningEl.style.display = 'block';
      this.deckWarningEl.className = 'prep-warning-banner error';
      this.deckWarningEl.textContent = 'Desteye en az 1 kart ekle';
      this.startBtn.disabled = true;
      this.startBtn.classList.add('disabled');
      return;
    }

    const hasSoldier = deck.some((id) => CARDS[id]?.category === 'asker');
    if (!hasSoldier) {
      this.deckWarningEl.style.display = 'block';
      this.deckWarningEl.className = 'prep-warning-banner warning';
      this.deckWarningEl.textContent = 'Destende asker kartı yok';
    } else {
      this.deckWarningEl.style.display = 'none';
    }

    // Başla düğmesi kontrolü (harita, zorluk ve geçerli deste seçilmeden pasif)
    const canStart = Boolean(this.selectedMap && this.selectedDifficulty && deck.length > 0);
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
