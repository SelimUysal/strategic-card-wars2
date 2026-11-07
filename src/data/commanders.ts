import { CommanderDef, CommanderId } from '../types';

// Bir maçta tek komutan seçilir; bonusu maç boyunca aktiftir; bonuslar aynı birime iki kez uygulanmaz.
export const COMMANDERS: Record<CommanderId, CommanderDef> = {
  fatih: {
    id: 'fatih',
    nameTr: 'Fatih Sultan Mehmet',
    abilityNameTr: 'Fetih',
    bonusTextTr: 'Şahi topunun hasarını %25 artırır.',
    startUnlocked: true,
    marketPriceGold: 0,
    effects: [
      {
        kind: 'statPct',
        stat: 'damage',
        pct: 0.25,
        filter: { unitIds: ['sahi'] },
      },
    ],
  },
  yavuz: {
    id: 'yavuz',
    nameTr: 'Yavuz Sultan Selim',
    abilityNameTr: 'Cihan Seferi',
    bonusTextTr: 'Tüm birliklerin saldırı gücünü %15 artırır.',
    startUnlocked: false,
    marketPriceGold: 1500,
    effects: [
      {
        kind: 'statPct',
        stat: 'damage',
        pct: 0.15,
        filter: {},
      },
    ],
  },
  kanuni: {
    id: 'kanuni',
    nameTr: 'Kanuni Sultan Süleyman',
    abilityNameTr: 'Muhteşem Nizam',
    bonusTextTr: 'Tüm birliklerin aldığı hasarı %20 azaltır.',
    startUnlocked: false,
    marketPriceGold: 1500,
    effects: [
      {
        kind: 'statPct',
        stat: 'damageTaken',
        pct: -0.2,
        filter: {},
      },
    ],
  },
  abdulhamid: {
    id: 'abdulhamid',
    nameTr: 'II. Abdülhamid',
    abilityNameTr: 'İstihbarat',
    bonusTextTr:
      'Seçen taraf sisten etkilenmez: ilk 5 dakika boyunca düşman birliklerini, binalarını ve komutanını görür.',
    startUnlocked: false,
    marketPriceGold: 2500,
    effects: [
      {
        kind: 'ignoreFog',
      },
    ],
  },
  vi_mehmed: {
    id: 'vi_mehmed',
    nameTr: 'VI. Mehmed (Vahdeddin)',
    abilityNameTr: 'Son Hüküm',
    bonusTextTr: 'Tüm kaynak üretimini %20 artırır.',
    startUnlocked: false,
    marketPriceGold: 1800,
    effects: [
      {
        kind: 'statPct',
        stat: 'gatherRate',
        pct: 0.2,
        filter: {},
      },
    ],
  },
  yildirim: {
    id: 'yildirim',
    nameTr: 'Yıldırım Bayezid',
    abilityNameTr: 'Yıldırım Hücumu',
    bonusTextTr: 'Tüm süvarilerin hareket hızını %25 artırır.',
    startUnlocked: false,
    marketPriceGold: 1800,
    effects: [
      {
        kind: 'statPct',
        stat: 'moveSpeed',
        pct: 0.25,
        filter: { tags: ['cavalry'] },
      },
    ],
  },
  celebi: {
    id: 'celebi',
    nameTr: 'Çelebi Mehmet',
    abilityNameTr: 'Devletin Dirilişi',
    bonusTextTr: 'Tüm birliklerin canını %15 artırır.',
    startUnlocked: false,
    marketPriceGold: 1800,
    effects: [
      {
        kind: 'statPct',
        stat: 'hp',
        pct: 0.15,
        filter: {},
      },
    ],
  },
  ii_murad: {
    id: 'ii_murad',
    nameTr: 'II. Murad',
    abilityNameTr: 'Savaş Nizamı',
    bonusTextTr: 'Tüm okçuların saldırı gücünü %20 artırır.',
    startUnlocked: false,
    marketPriceGold: 1200,
    effects: [
      {
        kind: 'statPct',
        stat: 'damage',
        pct: 0.2,
        filter: { tags: ['archer'] },
      },
    ],
  },
  sinan: {
    id: 'sinan',
    nameTr: 'Mimar Sinan',
    abilityNameTr: 'Ustalık Eseri',
    bonusTextTr: 'Tüm üretim ve savunma yapılarının inşa süresini %25 azaltır.',
    startUnlocked: false,
    marketPriceGold: 2000,
    effects: [
      {
        kind: 'statPct',
        stat: 'structureBuildTime',
        pct: -0.25,
        filter: {},
      },
    ],
  },
  eyup: {
    id: 'eyup',
    nameTr: 'Eyüp Sultan (Ebu Eyyûb el-Ensârî)',
    abilityNameTr: 'Manevi Kuvvet',
    bonusTextTr:
      "Her 20 saniyede dost askerlerin maksimum canının %15'i kadar iyileştirir (can maksimumu aşmaz). Hisar ve Mancınık-ı Azam'ın maksimum canını %10 artırır.",
    startUnlocked: false,
    marketPriceGold: 2500,
    effects: [
      {
        kind: 'periodicHealPct',
        everySec: 20,
        pct: 0.15,
      },
      {
        kind: 'statPct',
        stat: 'structureMaxHp',
        pct: 0.1,
        filter: { buildingIds: ['hisar', 'mancinik_i_azam'] },
      },
    ],
  },
};
