import { DEFAULT_DECK } from '../data/cards';
import { MATCH_RULES } from '../data/matchRules';
import { CardId } from '../types';
import { CollectionManager } from './CollectionManager';

export interface SetDeckResult {
  ok: boolean;
  error?: string;
}

export class DeckManager {
  private deck: CardId[] = [];
  private changeListeners: Array<() => void> = [];

  constructor(private collectionManager: CollectionManager) {
    this.resetToDefault();
  }

  public resetToDefault(): void {
    this.deck = [...DEFAULT_DECK];
  }

  // SPEC S3: setDeck(cardIds)
  // Kurallar: en çok deckSize (5), en az 1 kart; yalnızca açık kartlar; aynı kart iki kez olmaz
  public setDeck(cardIds: CardId[]): SetDeckResult {
    // 1. Boyut kontrolü
    if (!cardIds || cardIds.length < 1) {
      return { ok: false, error: 'Deste en az 1 kart içermelidir.' };
    }
    if (cardIds.length > MATCH_RULES.deckSize) {
      return { ok: false, error: `Deste en fazla ${MATCH_RULES.deckSize} kart olabilir.` };
    }

    // 2. Tekrar kontrolü
    const uniqueCards = new Set(cardIds);
    if (uniqueCards.size !== cardIds.length) {
      return { ok: false, error: 'Aynı kart desteye birden fazla eklenemez.' };
    }

    // 3. Açık kart kontrolü
    for (const cardId of cardIds) {
      if (!this.collectionManager.isCardUnlocked(cardId)) {
        return { ok: false, error: `Kart henüz açık değil: ${cardId}` };
      }
    }

    this.deck = [...cardIds];
    this.notifyChanged();
    return { ok: true };
  }

  public getDeck(): CardId[] {
    return [...this.deck];
  }

  public hasCard(cardId: CardId): boolean {
    return this.deck.includes(cardId);
  }

  public loadDeck(cardIds: CardId[]): void {
    if (cardIds && cardIds.length >= 1 && cardIds.length <= MATCH_RULES.deckSize) {
      // Yalnızca geçerli ve açık olanları al
      const valid = cardIds.filter(
        (id, index) =>
          cardIds.indexOf(id) === index && this.collectionManager.isCardUnlocked(id)
      );
      if (valid.length >= 1) {
        this.deck = [...valid];
        this.notifyChanged();
        return;
      }
    }
    this.resetToDefault();
  }

  public onChange(listener: () => void): () => void {
    this.changeListeners.push(listener);
    return () => {
      this.changeListeners = this.changeListeners.filter((l) => l !== listener);
    };
  }

  private notifyChanged(): void {
    for (const l of this.changeListeners) {
      l();
    }
  }
}
