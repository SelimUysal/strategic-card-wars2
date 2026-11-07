import { CARDS } from '../data/cards';
import { CardDef, CardId, Team } from '../types';
import { CollectionManager } from './CollectionManager';
import { DeckManager } from './DeckManager';

export class CardManager {
  private enemyCardIds: CardId[] = [];

  constructor(
    private collectionManager: CollectionManager,
    private deckManager: DeckManager
  ) {}

  // SPEC S1: getAllCards()
  public getAllCards(): CardDef[] {
    return Object.values(CARDS);
  }

  // SPEC S1: getCardsByCategory(category)
  public getCardsByCategory(category: 'asker' | 'savunma'): CardDef[] {
    return Object.values(CARDS).filter((c) => c.category === category);
  }

  // SPEC S1: isCardAvailable(team, cardId)
  // Oyuncu için kart AÇIK (koleksiyonda) VE destede ise true;
  // Düşman için setEnemyCardIds(ids) ile verilen listede ise true.
  public isCardAvailable(team: Team, cardId: CardId): boolean {
    if (team === 'player') {
      const isUnlocked = this.collectionManager.isCardUnlocked(cardId);
      const isInDeck = this.deckManager.hasCard(cardId);
      return isUnlocked && isInDeck;
    }

    // Düşman takımı kontrolü
    return this.enemyCardIds.includes(cardId);
  }

  // SPEC S1: setEnemyCardIds(ids)
  public setEnemyCardIds(ids: CardId[]): void {
    this.enemyCardIds = [...ids];
  }

  public getEnemyCardIds(): CardId[] {
    return [...this.enemyCardIds];
  }
}
