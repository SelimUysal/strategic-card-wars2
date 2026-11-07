import { FactionDef, FactionId } from '../types';

// Cehennem dışındaki üç modda oyuncu İslam Halifeliği'dir. Yalnızca Cehennem modunda oyuncu Batı Roma, yenilmez düşman İslam Halifeliği olur.
export const FACTIONS: Record<FactionId, FactionDef> = {
  islam_halifeligi: {
    id: 'islam_halifeligi',
    nameTr: 'İslam Halifeliği',
    colorHex: '#10b981',
  },
  bati_roma: {
    id: 'bati_roma',
    nameTr: 'Batı Roma',
    colorHex: '#e11d48',
  },
  fransa: {
    id: 'fransa',
    nameTr: 'Fransa Krallığı',
    colorHex: '#3b82f6',
  },
  ingiltere: {
    id: 'ingiltere',
    nameTr: 'İngiltere Krallığı',
    colorHex: '#f97316',
  },
  rusya: {
    id: 'rusya',
    nameTr: 'Rusya Krallığı',
    colorHex: '#a855f7',
  },
  alman: {
    id: 'alman',
    nameTr: 'Alman Krallığı',
    colorHex: '#64748b',
  },
  cin: {
    id: 'cin',
    nameTr: 'Çin Krallığı',
    colorHex: '#eab308',
  },
  israil: {
    id: 'israil',
    nameTr: 'İsrail',
    colorHex: '#06b6d4',
  },
  abd: {
    id: 'abd',
    nameTr: 'Amerika Birleşik Devletleri',
    colorHex: '#ec4899',
  },
  siyonist_ittifak: {
    id: 'siyonist_ittifak',
    nameTr: 'Siyonist İttifak',
    colorHex: '#6366f1',
  },
};

export const DEFAULT_PLAYER_FACTION: FactionId = 'islam_halifeligi';

export const HELL_FACTIONS: { player: FactionId; enemy: FactionId } = {
  player: 'bati_roma',
  enemy: 'islam_halifeligi',
};
