import { CollectionManager } from '../cards/CollectionManager';
import { DeckManager } from '../cards/DeckManager';
import { MapId, MatchHistoryEntry, Profile } from '../types';
import { CurrencyManager } from './CurrencyManager';
import { SaveManager } from './SaveManager';

export class AccountManager {
  private static instance: AccountManager | null = null;
  private profile: Profile;

  constructor(
    private saveManager: SaveManager,
    private currencyManager: CurrencyManager,
    private collectionManager: CollectionManager,
    private deckManager: DeckManager
  ) {
    AccountManager.instance = this;
    this.profile = this.saveManager.createDefaultProfile();

    // Deste değişikliği veya koleksiyon/altın güncellemelerinde kaydı tetikle
    this.deckManager.onChange(() => {
      this.syncFromManagers();
      this.saveManager.save(this.profile);
    });
  }

  public static getInstance(): AccountManager | null {
    return AccountManager.instance;
  }

  public getSaveManager(): SaveManager {
    return this.saveManager;
  }

  public setTestMode(enabled: boolean): void {
    this.saveManager.setTestMode(enabled);
  }

  // SPEC S4: Test profilini sıfırla
  public async resetTestProfile(): Promise<Profile> {
    const defaultProf = await this.saveManager.resetTestDatabase();
    this.profile = defaultProf;

    this.currencyManager.setGold(this.profile.accountGold);
    this.collectionManager.setUnlocked(
      this.profile.unlockedCards,
      this.profile.unlockedCommanders
    );
    this.deckManager.loadDeck(this.profile.deck);

    return this.profile;
  }


  public isAudioMuted(): boolean {
    return Boolean(this.profile.audioMuted);
  }

  public async setAudioMuted(muted: boolean): Promise<void> {
    this.profile.audioMuted = muted;
    await this.save();
  }

  // SPEC S7: load()
  public async load(): Promise<Profile> {
    const loaded = await this.saveManager.load();
    this.profile = loaded;

    // Yöneticileri profille senkronla
    this.currencyManager.setGold(this.profile.accountGold);
    this.collectionManager.setUnlocked(
      this.profile.unlockedCards,
      this.profile.unlockedCommanders
    );
    this.deckManager.loadDeck(this.profile.deck);

    return this.profile;
  }

  // SPEC S7: save()
  public async save(): Promise<void> {
    this.syncFromManagers();
    await this.saveManager.save(this.profile);
  }

  // SPEC S7: getProfile()
  public getProfile(): Profile {
    this.syncFromManagers();
    return {
      ...this.profile,
      unlockedCards: [...this.profile.unlockedCards],
      unlockedCommanders: [...this.profile.unlockedCommanders],
      deck: [...this.profile.deck],
      survivalRecords: { ...this.profile.survivalRecords },
      history: [...this.profile.history],
    };
  }

  // SPEC S7: recordMatch(entry)
  public async recordMatch(entry: MatchHistoryEntry): Promise<void> {
    this.profile.history.push({ ...entry });

    if (entry.accountGoldDelta > 0) {
      this.currencyManager.add(entry.accountGoldDelta);
    } else if (entry.accountGoldDelta < 0) {
      this.currencyManager.applyPenalty(-entry.accountGoldDelta);
    }

    await this.save();
  }

  // SPEC S7: getSurvivalRecord(mapId)
  public getSurvivalRecord(mapId: MapId): number {
    return this.profile.survivalRecords[mapId] || 0;
  }

  // SPEC S7: setSurvivalRecord(mapId, sec) (yalnızca öncekinden büyükse)
  public async setSurvivalRecord(mapId: MapId, sec: number): Promise<void> {
    const current = this.profile.survivalRecords[mapId] || 0;
    if (sec > current) {
      this.profile.survivalRecords[mapId] = sec;
      await this.save();
    }
  }

  private syncFromManagers(): void {
    this.profile.accountGold = this.currencyManager.getGold();
    this.profile.unlockedCards = this.collectionManager.getUnlockedCards();
    this.profile.unlockedCommanders = this.collectionManager.getUnlockedCommanders();
    this.profile.deck = this.deckManager.getDeck();
  }
}
