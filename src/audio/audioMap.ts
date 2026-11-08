export type AudioKey =
  // Music
  | 'muzik_menu'
  | 'muzik_hazirlik'
  | 'muzik_sefer_marsi'
  | 'muzik_savas'
  | 'muzik_cehennem'
  | 'muzik_zafer'
  | 'muzik_yenilgi'
  // Horns & SFX
  | 'sfx_boru_sefer'
  | 'sfx_boru_savas'
  | 'sfx_tikla'
  | 'sfx_kart_sec'
  | 'sfx_bina_yerlestir'
  | 'sfx_hata'
  | 'sfx_insaat_bitti'
  | 'sfx_asker_hazir'
  | 'sfx_isci_hazir'
  | 'sfx_teslim_altin'
  | 'sfx_teslim_odun'
  | 'sfx_ok'
  | 'sfx_top'
  | 'sfx_tas'
  | 'sfx_kilic'
  | 'sfx_olum'
  | 'sfx_bina_yikim'
  | 'sfx_duraklat'
  | 'sfx_devam'
  | 'sfx_hiz'
  | 'sfx_satin_al'
  | 'sfx_ortam';

export interface AudioDef {
  key: AudioKey;
  fileName: string;
  category: 'music' | 'sfx' | 'ambient';
  loop: boolean;
  volume: number;
}

export const AUDIO_MAP: Record<AudioKey, AudioDef> = {
  // Müzikler (0,5 ses seviyesi)
  muzik_menu: { key: 'muzik_menu', fileName: 'muzik_menu', category: 'music', loop: true, volume: 0.5 },
  muzik_hazirlik: { key: 'muzik_hazirlik', fileName: 'muzik_hazirlik', category: 'music', loop: true, volume: 0.5 },
  muzik_sefer_marsi: { key: 'muzik_sefer_marsi', fileName: 'muzik_sefer_marsi', category: 'music', loop: true, volume: 0.5 },
  muzik_savas: { key: 'muzik_savas', fileName: 'muzik_savas', category: 'music', loop: true, volume: 0.5 },
  muzik_cehennem: { key: 'muzik_cehennem', fileName: 'muzik_cehennem', category: 'music', loop: true, volume: 0.5 },
  muzik_zafer: { key: 'muzik_zafer', fileName: 'muzik_zafer', category: 'music', loop: false, volume: 0.5 },
  muzik_yenilgi: { key: 'muzik_yenilgi', fileName: 'muzik_yenilgi', category: 'music', loop: false, volume: 0.5 },

  // Borular (1,0 ses seviyesi)
  sfx_boru_sefer: { key: 'sfx_boru_sefer', fileName: 'sfx_boru_sefer', category: 'sfx', loop: false, volume: 1.0 },
  sfx_boru_savas: { key: 'sfx_boru_savas', fileName: 'sfx_boru_savas', category: 'sfx', loop: false, volume: 1.0 },

  // Efektler (0,8 ses seviyesi)
  sfx_tikla: { key: 'sfx_tikla', fileName: 'sfx_tikla', category: 'sfx', loop: false, volume: 0.8 },
  sfx_kart_sec: { key: 'sfx_kart_sec', fileName: 'sfx_kart_sec', category: 'sfx', loop: false, volume: 0.8 },
  sfx_bina_yerlestir: { key: 'sfx_bina_yerlestir', fileName: 'sfx_bina_yerlestir', category: 'sfx', loop: false, volume: 0.8 },
  sfx_hata: { key: 'sfx_hata', fileName: 'sfx_hata', category: 'sfx', loop: false, volume: 0.8 },
  sfx_insaat_bitti: { key: 'sfx_insaat_bitti', fileName: 'sfx_insaat_bitti', category: 'sfx', loop: false, volume: 0.8 },
  sfx_asker_hazir: { key: 'sfx_asker_hazir', fileName: 'sfx_asker_hazir', category: 'sfx', loop: false, volume: 0.8 },
  sfx_isci_hazir: { key: 'sfx_isci_hazir', fileName: 'sfx_isci_hazir', category: 'sfx', loop: false, volume: 0.8 },
  sfx_teslim_altin: { key: 'sfx_teslim_altin', fileName: 'sfx_teslim_altin', category: 'sfx', loop: false, volume: 0.8 },
  sfx_teslim_odun: { key: 'sfx_teslim_odun', fileName: 'sfx_teslim_odun', category: 'sfx', loop: false, volume: 0.8 },
  sfx_ok: { key: 'sfx_ok', fileName: 'sfx_ok', category: 'sfx', loop: false, volume: 0.8 },
  sfx_top: { key: 'sfx_top', fileName: 'sfx_top', category: 'sfx', loop: false, volume: 0.8 },
  sfx_tas: { key: 'sfx_tas', fileName: 'sfx_tas', category: 'sfx', loop: false, volume: 0.8 },
  sfx_kilic: { key: 'sfx_kilic', fileName: 'sfx_kilic', category: 'sfx', loop: false, volume: 0.8 },
  sfx_olum: { key: 'sfx_olum', fileName: 'sfx_olum', category: 'sfx', loop: false, volume: 0.8 },
  sfx_bina_yikim: { key: 'sfx_bina_yikim', fileName: 'sfx_bina_yikim', category: 'sfx', loop: false, volume: 0.8 },
  sfx_duraklat: { key: 'sfx_duraklat', fileName: 'sfx_duraklat', category: 'sfx', loop: false, volume: 0.8 },
  sfx_devam: { key: 'sfx_devam', fileName: 'sfx_devam', category: 'sfx', loop: false, volume: 0.8 },
  sfx_hiz: { key: 'sfx_hiz', fileName: 'sfx_hiz', category: 'sfx', loop: false, volume: 0.8 },
  sfx_satin_al: { key: 'sfx_satin_al', fileName: 'sfx_satin_al', category: 'sfx', loop: false, volume: 0.8 },

  // Ortam (0,5 ses seviyesi, döngülü)
  sfx_ortam: { key: 'sfx_ortam', fileName: 'sfx_ortam', category: 'ambient', loop: true, volume: 0.5 },
};

export function getAudioFileUrl(fileName: string): string {
  const baseUrl = import.meta.env.BASE_URL || '/';
  const cleanBase = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  return `${cleanBase}audio/${fileName}.mp3`;
}
