import { CARDS, DEFAULT_DECK } from '../data/cards';
import { MATCH_RULES } from '../data/matchRules';
import { CardId, Profile } from '../types';

export const SAVE_SCHEMA_VERSION = 1;

export class SaveManager {
  private readonly DB_NAME = 'kart-strateji-kayit';
  private readonly DB_VERSION = 1;
  private readonly STORE_NAME = 'profile';
  private readonly RECORD_KEY = 'user_profile';

  // Bellek içi yedek profil (IndexedDB açılamazsa veya hata durumunda)
  private memoryProfile: Profile | null = null;

  // Migrations tablosu (yapı hazır, şimdilik boş)
  private migrations: Record<number, (oldData: any) => any> = {};

  // SPEC S8: Varsayılan profil üretici
  public createDefaultProfile(): Profile {
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
    };
  }

  // SPEC S8: load()
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

  // SPEC S8: save(profile)
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

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB ortamda bulunamadı.'));
        return;
      }

      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME);
        }
      };

      request.onsuccess = () => {
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
