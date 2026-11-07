import { CARDS } from '../data/cards';
import { COMMANDERS } from '../data/commanders';
import { CardDef, CardId, CommanderDef, CommanderId } from '../types';
import { CollectionManager } from '../cards/CollectionManager';
import { AccountManager } from './AccountManager';
import { CurrencyManager } from './CurrencyManager';

export interface CardMarketItem {
  card: CardDef;
  price: number;
  owned: boolean;
}

export interface CommanderMarketItem {
  commander: CommanderDef;
  price: number;
  owned: boolean;
}

export type BuyResult = {
  ok: boolean;
  reason?: 'already_owned' | 'not_enough_gold' | 'invalid_id';
};

export class MarketManager {
  constructor(
    private currencyManager: CurrencyManager,
    private collectionManager: CollectionManager,
    private accountManager: AccountManager
  ) {}

  // SPEC S5 Listeler: kartlar (fiyat CARDS.marketPriceGold; sahip olunanlar 'owned' işaretli)
  public getCardsMarket(): CardMarketItem[] {
    return Object.values(CARDS).map((card) => ({
      card,
      price: card.marketPriceGold,
      owned: this.collectionManager.isCardUnlocked(card.id),
    }));
  }

  // SPEC S5 Listeler: komutanlar (fiyat COMMANDERS.marketPriceGold)
  public getCommandersMarket(): CommanderMarketItem[] {
    return Object.values(COMMANDERS).map((commander) => ({
      commander,
      price: commander.marketPriceGold,
      owned: this.collectionManager.isCommanderUnlocked(commander.id),
    }));
  }

  // SPEC S5: buyCard(id)
  // Sahip değilse ve hesap altını yetiyorsa fiyat düşülür, öğe kalıcı olarak açılır ve kayıt yapılır; aksi hâlde nedeniyle birlikte başarısız olur
  public async buyCard(id: CardId): Promise<BuyResult> {
    const card = CARDS[id];
    if (!card) {
      return { ok: false, reason: 'invalid_id' };
    }

    if (this.collectionManager.isCardUnlocked(id)) {
      return { ok: false, reason: 'already_owned' };
    }

    const price = card.marketPriceGold;
    if (!this.currencyManager.canAfford(price)) {
      return { ok: false, reason: 'not_enough_gold' };
    }

    // Fiyat düşülür
    const spent = this.currencyManager.spend(price);
    if (!spent) {
      return { ok: false, reason: 'not_enough_gold' };
    }

    // Kalıcı olarak açılır ve kayıt yapılır
    this.collectionManager.unlockCard(id);
    await this.accountManager.save();

    return { ok: true };
  }

  // SPEC S5: buyCommander(id)
  public async buyCommander(id: CommanderId): Promise<BuyResult> {
    const commander = COMMANDERS[id];
    if (!commander) {
      return { ok: false, reason: 'invalid_id' };
    }

    if (this.collectionManager.isCommanderUnlocked(id)) {
      return { ok: false, reason: 'already_owned' };
    }

    const price = commander.marketPriceGold;
    if (!this.currencyManager.canAfford(price)) {
      return { ok: false, reason: 'not_enough_gold' };
    }

    // Fiyat düşülür
    const spent = this.currencyManager.spend(price);
    if (!spent) {
      return { ok: false, reason: 'not_enough_gold' };
    }

    // Kalıcı olarak açılır ve kayıt yapılır
    this.collectionManager.unlockCommander(id);
    await this.accountManager.save();

    return { ok: true };
  }
}
