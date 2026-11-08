import { AUDIO_MAP, AudioKey, getAudioFileUrl } from './audioMap';

export interface SpatialOptions {
  pos?: { x: number; y: number };
  cameraCenter?: { x: number; y: number };
  fogOfWar?: {
    isTileExplored?: (x: number, y: number) => boolean;
    canPlayerSeeTile?: (x: number, y: number) => boolean;
  };
}

export class AudioManager {
  private static instance: AudioManager | null = null;

  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGainNode: GainNode | null = null;
  private sfxGainNode: GainNode | null = null;

  private audioBuffers: Map<AudioKey, AudioBuffer> = new Map();
  private missingKeys: Set<AudioKey> = new Set();
  private isPreloaded = false;

  private isMuted = false;

  // Müzik Durumu
  private currentMusicKey: AudioKey | null = null;
  private currentMusicSource: AudioBufferSourceNode | null = null;
  private currentMusicTrackGain: GainNode | null = null;

  // Ortam Ses Durumu
  private currentAmbienceKey: AudioKey | null = null;
  private currentAmbienceSource: AudioBufferSourceNode | null = null;

  // SFX Hız Sınırlama & Eşzamanlılık
  private lastPlayTimes: Map<AudioKey, number> = new Map();
  private activeSfxSources: Map<AudioKey, Set<AudioBufferSourceNode>> = new Map();

  // TASARIM KARARLARI: Mesafe yarıçapı ve sönümlenme eğrisi
  private readonly INNER_RADIUS = 5;  // 5 karoya kadar tam ses
  private readonly MAX_RADIUS = 25;   // 25 karodan sonra hiç duyulmaz (0 ses)
  private readonly MIN_TRIGGER_INTERVAL_MS = 80; // Aynı efekt için en az 80 ms
  private readonly MAX_CONCURRENT_PER_KEY = 4;   // Aynı efektten en çok 4 eşzamanlı ses

  constructor() {
    AudioManager.instance = this;
    this.initAudioContext();
  }

  public static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  private initAudioContext(): void {
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
        this.masterGain = this.ctx.createGain();
        this.musicGainNode = this.ctx.createGain();
        this.sfxGainNode = this.ctx.createGain();

        this.musicGainNode.connect(this.masterGain);
        this.sfxGainNode.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
      }
    } catch (err) {
      console.warn('AudioManager: Web Audio API başlatılamadı:', err);
    }

    // Kullanıcı etkileşiminde AudioContext'i resume et (SPEC S2)
    const unlockCtx = () => {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      window.removeEventListener('pointerdown', unlockCtx);
      window.removeEventListener('keydown', unlockCtx);
    };
    window.addEventListener('pointerdown', unlockCtx);
    window.addEventListener('keydown', unlockCtx);

    // Sekme görünürlüğü değişince duraklat / devam ettir (SPEC S6)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.ctx && this.ctx.state === 'running') {
          this.ctx.suspend().catch(() => {});
        }
      } else {
        if (this.ctx && this.ctx.state === 'suspended' && !this.isMuted) {
          this.ctx.resume().catch(() => {});
        }
      }
    });

    // Açılışta ses dosyalarını tara / önceden yükle
    this.preloadAll();
  }

  // SPEC S1: Eksik dosyalar HATA vermez; açılışta tek bilgi satırıyla konsola yazılır
  public async preloadAll(): Promise<void> {
    if (this.isPreloaded) return;
    this.isPreloaded = true;

    const keys = Object.keys(AUDIO_MAP) as AudioKey[];
    const missingList: AudioKey[] = [];

    await Promise.all(
      keys.map(async (key) => {
        const def = AUDIO_MAP[key];
        const url = getAudioFileUrl(def.fileName);

        try {
          const resp = await fetch(url);
          if (!resp.ok) {
            this.missingKeys.add(key);
            missingList.push(key);
            return;
          }
          const arrayBuffer = await resp.arrayBuffer();
          if (this.ctx) {
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            this.audioBuffers.set(key, audioBuffer);
          }
        } catch {
          this.missingKeys.add(key);
          missingList.push(key);
        }
      })
    );

    if (missingList.length > 0) {
      console.info('AudioManager: Eksik ses dosyaları (sessiz modda çalışacak):', missingList.join(', '));
    }
  }

  // SPEC S7: Sessize alma toggle
  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : 1, this.ctx.currentTime);
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  // SPEC S6: Oyun duraklatılınca müzik %30 seviyeye iner
  public setGamePaused(paused: boolean): void {
    if (!this.ctx || !this.musicGainNode) return;

    const now = this.ctx.currentTime;
    const targetGain = paused ? 0.3 : 1.0;
    this.musicGainNode.gain.cancelScheduledValues(now);
    this.musicGainNode.gain.linearRampToValueAtTime(targetGain, now + 0.2);
  }

  // SPEC S3: Müzik Oynatma (1,5 sn Çapraz Geçiş / Crossfade)
  public playMusic(key: AudioKey): void {
    if (this.currentMusicKey === key) return;

    if (!this.ctx || this.missingKeys.has(key)) {
      // Dosya yoksa veya AudioContext yoksa eski müziği durdur, yeni müzik sessiz
      this.stopCurrentMusic(1.5);
      this.currentMusicKey = key;
      return;
    }

    const buffer = this.audioBuffers.get(key);
    if (!buffer) {
      this.stopCurrentMusic(1.5);
      this.currentMusicKey = key;
      return;
    }

    const now = this.ctx.currentTime;
    const def = AUDIO_MAP[key];

    // Eski müziği 1.5 saniyede fade out ile kapat
    this.stopCurrentMusic(1.5);

    // Yeni müzik kanalı oluştur
    const newTrackGain = this.ctx.createGain();
    newTrackGain.gain.setValueAtTime(0, now);
    newTrackGain.gain.linearRampToValueAtTime(def.volume, now + 1.5);

    if (this.musicGainNode) {
      newTrackGain.connect(this.musicGainNode);
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    // Sefer marşı kuralı (S3): < 60sn ise döngülü, >= 60sn ise döngüsüz
    if (key === 'muzik_sefer_marsi') {
      source.loop = buffer.duration < 60;
    } else {
      source.loop = def.loop;
    }

    source.connect(newTrackGain);
    source.start(now);

    this.currentMusicKey = key;
    this.currentMusicSource = source;
    this.currentMusicTrackGain = newTrackGain;
  }

  private stopCurrentMusic(fadeDurationSec: number): void {
    if (!this.ctx || !this.currentMusicSource || !this.currentMusicTrackGain) {
      this.currentMusicSource = null;
      this.currentMusicTrackGain = null;
      return;
    }

    const now = this.ctx.currentTime;
    const oldSource = this.currentMusicSource;
    const oldGain = this.currentMusicTrackGain;

    oldGain.gain.cancelScheduledValues(now);
    oldGain.gain.setValueAtTime(oldGain.gain.value, now);
    oldGain.gain.linearRampToValueAtTime(0, now + fadeDurationSec);

    setTimeout(() => {
      try {
        oldSource.stop();
        oldSource.disconnect();
        oldGain.disconnect();
      } catch {}
    }, fadeDurationSec * 1000 + 100);

    this.currentMusicSource = null;
    this.currentMusicTrackGain = null;
  }

  // SPEC S3: İsteğe Bağlı Ortam Sesi (`sfx_ortam`)
  public playAmbience(key: AudioKey = 'sfx_ortam'): void {
    if (this.currentAmbienceKey === key) return;
    this.stopAmbience();

    if (!this.ctx || this.missingKeys.has(key)) return;
    const buffer = this.audioBuffers.get(key);
    if (!buffer) return;

    const now = this.ctx.currentTime;
    const def = AUDIO_MAP[key];

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(def.volume, now);

    if (this.sfxGainNode) {
      gain.connect(this.sfxGainNode);
    }
    source.connect(gain);
    source.start(now);

    this.currentAmbienceKey = key;
    this.currentAmbienceSource = source;
  }

  public stopAmbience(): void {
    if (this.currentAmbienceSource) {
      try {
        this.currentAmbienceSource.stop();
        this.currentAmbienceSource.disconnect();
      } catch {}
      this.currentAmbienceSource = null;
    }
    this.currentAmbienceKey = null;
  }

  // SPEC S4 & S5: Efekt Çalma (Limitler & Konumsal Mesafe Sönümlenmesi)
  public playSfx(key: AudioKey, spatial?: SpatialOptions): void {
    if (this.isMuted || !this.ctx || this.missingKeys.has(key)) return;

    const buffer = this.audioBuffers.get(key);
    if (!buffer) return;

    const nowMs = performance.now();

    // S5 Limit 1: En az 80 ms zaman aralığı
    const lastTime = this.lastPlayTimes.get(key) || 0;
    if (nowMs - lastTime < this.MIN_TRIGGER_INTERVAL_MS) {
      return;
    }

    // S5 Limit 2: En çok 4 eşzamanlı aktif ses
    let activeSet = this.activeSfxSources.get(key);
    if (!activeSet) {
      activeSet = new Set();
      this.activeSfxSources.set(key, activeSet);
    }
    if (activeSet.size >= this.MAX_CONCURRENT_PER_KEY) {
      return;
    }

    // S5 Konumsal Mesafe & Görüş Kontrolü (Savaş / Dünya sesleri için)
    let spatialVolMultiplier = 1.0;
    if (spatial && spatial.pos) {
      const { pos, cameraCenter, fogOfWar } = spatial;

      // Sis kontrolü: Görünmeyen noktada ses çalmaz
      if (fogOfWar) {
        const px = Math.floor(pos.x);
        const py = Math.floor(pos.y);
        const canSee = fogOfWar.canPlayerSeeTile ? fogOfWar.canPlayerSeeTile(px, py) : (fogOfWar.isTileExplored ? fogOfWar.isTileExplored(px, py) : true);
        if (!canSee) return;
      }

      // Kamera merkezine olan mesafe
      if (cameraCenter) {
        const dist = Math.hypot(pos.x - cameraCenter.x, pos.y - cameraCenter.y);

        if (dist >= this.MAX_RADIUS) {
          // 25 karodan uzaktaysa hiç çalmaz
          return;
        } else if (dist > this.INNER_RADIUS) {
          // 5 ile 25 karo arası doğrusal sönümlenme eğrisi
          spatialVolMultiplier = 1.0 - (dist - this.INNER_RADIUS) / (this.MAX_RADIUS - this.INNER_RADIUS);
        }
      }
    }

    const def = AUDIO_MAP[key];
    const finalVolume = def.volume * spatialVolMultiplier;

    if (finalVolume <= 0.01) return;

    const ctxTime = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = false;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(finalVolume, ctxTime);

    if (this.sfxGainNode) {
      gain.connect(this.sfxGainNode);
    }
    source.connect(gain);
    source.start(ctxTime);

    this.lastPlayTimes.set(key, nowMs);
    activeSet.add(source);

    source.onended = () => {
      activeSet.delete(source);
      source.disconnect();
      gain.disconnect();
    };
  }

  // Oyundan tamamen çıkılırken tüm müzik ve efektleri kapat
  public stopAll(): void {
    this.stopCurrentMusic(0.2);
    this.stopAmbience();

    for (const [, set] of this.activeSfxSources.entries()) {
      for (const src of set) {
        try {
          src.stop();
          src.disconnect();
        } catch {}
      }
      set.clear();
    }
  }
}
