import { CARDS } from '../data/cards';
import { CardId, CommanderId } from '../types';

export class CollectionManager {
  private unlockedCards: Set<CardId> = new Set();
  private unlockedCommanders: Set<CommanderId> = new Set();
  private changeListeners: Array<() => void> = [];

  constructor() {
    this.resetToDefaults();
  }

  // SPEC S2: İlk açılışta açık kartlar CARDS içinde startUnlocked true olanlar; açık komutan yalnızca 'fatih'
  public resetToDefaults(): void {
    this.unlockedCards.clear();
    for (const card of Object.values(CARDS)) {
      if (card.startUnlocked) {
        this.unlockedCards.add(card.id);
      }
    }

    this.unlockedCommanders.clear();
    this.unlockedCommanders.add('fatih');
  }

  // SPEC S2: unlockCard
  public unlockCard(cardId: CardId): boolean {
    if (!this.unlockedCards.has(cardId)) {
      this.unlockedCards.add(cardId);
      this.notifyChanged();
      return true;
    }
    return false;
  }

  // SPEC S2: unlockCommander
  public unlockCommander(commanderId: CommanderId): boolean {
    if (!this.unlockedCommanders.has(commanderId)) {
      this.unlockedCommanders.add(commanderId);
      this.notifyChanged();
      return true;
    }
    return false;
  }

  // SPEC S2: isCardUnlocked
  public isCardUnlocked(cardId: CardId): boolean {
    return this.unlockedCards.has(cardId);
  }

  // SPEC S2: isCommanderUnlocked
  public isCommanderUnlocked(commanderId: CommanderId): boolean {
    return this.unlockedCommanders.has(commanderId);
  }

  // SPEC S2: Liste okuyucuları
  public getUnlockedCards(): CardId[] {
    return Array.from(this.unlockedCards);
  }

  public getUnlockedCommanders(): CommanderId[] {
    return Array.from(this.unlockedCommanders);
  }

  // Profil senkronizasyonu
  public setUnlocked(cards: CardId[], commanders: CommanderId[]): void {
    this.unlockedCards = new Set(cards);
    this.unlockedCommanders = new Set(commanders);

    // Temel varsayılanların her zaman açık kalmasını garanti et
    for (const card of Object.values(CARDS)) {
      if (card.startUnlocked) {
        this.unlockedCards.add(card.id);
      }
    }
    this.unlockedCommanders.add('fatih');
    this.notifyChanged();
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
