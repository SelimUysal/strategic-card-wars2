import { CARDS, DEFAULT_DECK } from '../data/cards';
import { COMMANDERS } from '../data/commanders';
import { MATCH_RULES } from '../data/matchRules';
import { CardId, CommanderId, Profile } from '../types';

export const SAVE_SCHEMA_VERSION = 1;

export class SaveManager {
  private static globalTestMode: boolean = false;

  private readonly DB_NAME_NORMAL = 'kart-strateji-kayit';
  private readonly DB_NAME_TEST = 'kart-strateji-kayit-test';
  private readonly DB_VERSION = 1;
  private readonly STORE_NAME = 'profile';
  private readonly RECORD_KEY = 'user_profile';

  private isTestMode: boolean = false;
  private currentDb: IDBDatabase | null = null;

  // Bellek içi yedek profil (IndexedDB açılamazsa veya hata durumunda)
  private memoryProfile: Profile | null = null;

  // Migrations tablosu (yapı hazır, şimdilik boş)
  private migrations: Record<number, (oldData: any) => any> = {};

  constructor(testMode?: boolean) {
    if (testMode !== undefined) {
      this.isTestMode = testMode;
    } else {
      this.isTestMode = SaveManager.globalTestMode;
    }
  }

  public static setTestMode(enabled: boolean): void {
    SaveManager.globalTestMode = enabled;
  }

  public static isTestMode(): boolean {
    return SaveManager.globalTestMode;
  }

  public setTestMode(enabled: boolean): void {
    this.isTestMode = enabled;
  }

  public isTest(): boolean {
    return this.isTestMode || SaveManager.globalTestMode;
  }

  public getDbName(): string {
    return this.isTest() ? this.DB_NAME_TEST : this.DB_NAME_NORMAL;
  }

  // SPEC S3: Test profili varsayılan üretici
  public createDefaultTestProfile(): Profile {
    const allCards = Object.keys(CARDS) as CardId[];
    const allCommanders = Object.keys(COMMANDERS) as CommanderId[];

    return {
      accountGold: 99999,
      unlockedCards: allCards,
      unlockedCommanders: allCommanders,
      deck: [...DEFAULT_DECK],
      survivalRecords: {},
      history: [],
      audioMuted: false,
    };
  }

  // SPEC S8 (Normal) & S3 (Test): Varsayılan profil üretici
  public createDefaultProfile(): Profile {
    if (this.isTest()) {
      return this.createDefaultTestProfile();
    }

    const startCards: CardId[] = [];
    for (const card of Object.values(CARDS)) {
      if (card.startUnlocked) {
        startCards.push(card.id);
      }
    }

    return {
      accountGold: MATCH_RULES.startAccountGold,
      unlockedCards: startCards,
      unlockedCommanders: ['fatih'],
      deck: [...DEFAULT_DECK],
      survivalRecords: {},
      history: [],
      audioMuted: false,
    };
  }

  // SPEC S8 & S3: load()
  public async load(): Promise<Profile> {
    try {
      const db = await this.openDatabase();
      const rawRecord = await this.getRecord<{ version: number; profile: Profile }>(db, this.RECORD_KEY);

      if (!rawRecord || !rawRecord.profile) {
        // Kayıt yoksa varsayılan profil
        const defaultProf = this.createDefaultProfile();
        this.memoryProfile = defaultProf;
        await this.save(defaultProf);
        return defaultProf;
      }

      // Kayıt sürümü eskiyse migrations tablosundan geçirilir
      let recordVersion = rawRecord.version || 1;
      let recordProfile = rawRecord.profile;

      while (recordVersion < SAVE_SCHEMA_VERSION) {
        const migrationFn = this.migrations[recordVersion];
        if (migrationFn) {
          recordProfile = migrationFn(recordProfile);
        }
        recordVersion++;
      }

      this.memoryProfile = recordProfile;
      return recordProfile;
    } catch (err) {
      // SPEC S8: IndexedDB açılamazsa konsola hata yazılır ve oyun bellek içi profille devam eder [EK]
      console.error('IndexedDB yüklenirken hata oluştu, bellek içi profille devam ediliyor:', err);
      if (!this.memoryProfile) {
        this.memoryProfile = this.createDefaultProfile();
      }
      return this.memoryProfile;
    }
  }

  // SPEC S8 & S3: save(profile)
  public async save(profile: Profile): Promise<void> {
    this.memoryProfile = { ...profile };

    try {
      const db = await this.openDatabase();
      const dataToSave = {
        version: SAVE_SCHEMA_VERSION,
        profile,
      };
      await this.putRecord(db, this.RECORD_KEY, dataToSave);
    } catch (err) {
      console.error('IndexedDB kaydedilirken hata oluştu, bellek içi saklandı:', err);
    }
  }

  // SPEC S4: Test veritabanını sil ve S3'teki varsayılan test profilini yeniden oluştur
  public async resetTestDatabase(): Promise<Profile> {
    if (!this.isTest()) {
      throw new Error('Test veritabanı sıfırlama yalnızca test modunda yapılabilir.');
    }

    if (this.currentDb) {
      this.currentDb.close();
      this.currentDb = null;
    }

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.DB_NAME_TEST);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        console.warn('Test veritabanı silinirken bloklandı, işleme devam ediliyor');
        resolve();
      };
    });

    const defaultTestProf = this.createDefaultTestProfile();
    this.memoryProfile = defaultTestProf;
    await this.save(defaultTestProf);
    return defaultTestProf;
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB ortamda bulunamadı.'));
        return;
      }

      const dbName = this.getDbName();
      const request = indexedDB.open(dbName, this.DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME);
        }
      };

      request.onsuccess = () => {
        this.currentDb = request.result;
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  private getRecord<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, 'readonly');
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result as T);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  private putRecord(db: IDBDatabase, key: string, value: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, 'readwrite');
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.put(value, key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }
}
