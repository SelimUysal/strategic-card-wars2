/**
 * R11A: Ortak Görsel Renk Paleti (Palette.ts)
 * Bütün stilize low-poly dünya renkleri tek yerde, adlandırılmış sabitler.
 * Takım renkleri FACTIONS'tan dinamik olarak gelir, buraya dokunulmaz.
 */

export const PALETTE = {
  // Çim (açık, koyu, kuru)
  grassLight: 0x5da83b,
  grassDark: 0x3d7b26,
  grassDry: 0x8fa34c,

  // Toprak
  dirt: 0x8a5a36,
  dirtDark: 0x5c3a21,

  // Kum
  sand: 0xdfbe76,

  // Orman (3 ton)
  forestLight: 0x2e6f40,
  forestMedium: 0x1e522d,
  forestDark: 0x13381e,

  // Su (sığ, derin)
  waterShallow: 0x38bdf8,
  waterDeep: 0x0284c7,

  // Kaya (açık, koyu)
  rockLight: 0x8892b0,
  rockDark: 0x515d78,

  // Kar
  snow: 0xe8eff8,

  // Ahşap (açık, koyu)
  woodLight: 0xb57842,
  woodDark: 0x6e4321,

  // Taş (açık, koyu)
  stoneLight: 0x9ca3af,
  stoneDark: 0x4b5563,

  // Kiremit
  tileRed: 0xc2410c,

  // Kubbe (kurşun grisi / turkuaz)
  domeLead: 0x64748b,
  domeTurquoise: 0x0d9488,

  // Altın
  gold: 0xf59e0b,

  // Parşömen
  parchment: 0xf6ebd4,

  // Duman
  smoke: 0x94a3b8,

  // Ateş
  fire: 0xf97316,
  fireYellow: 0xfde047,

  // Atmosfer, Gökyüzü ve Işık
  skyZenith: 0x60a5fa,
  skyHorizon: 0xcfe4ff,
  fog: 0xcfe4ff,
  hemiSky: 0xdbeafe,
  hemiGround: 0x785338,
  sunLight: 0xfff7ed,

  // Gölge rengi
  shadowBlob: 0x0f172a,

  // Doğa, Ağaç ve Çiçek Renkleri (R11B)
  pineNeedle: 0x14532d,
  oakLeaves: 0x22c55e,
  cypress: 0x166534,
  flowerRed: 0xef4444,
  flowerYellow: 0xfacc15,
  flowerWhite: 0xf8fafc,
  flowerBlue: 0x3b82f6,

  // Su ve Nehir Detayları
  riverFoam: 0xe0f2fe,
  riverWave: 0x0284c7,

  // Dağ, Kaya ve Yapılar
  rockSnow: 0xf1f5f9,
  wallStone: 0x64748b,
  ruinsStone: 0x475569,
  fieldCrop: 0xa3e635,
  fieldDirt: 0x713f12,

  // Kaynak Noktası Renkleri (Altın ve Odun)
  goldOre: 0x2d2a26,
  goldVein: 0xfbbf24,
  goldEmissive: 0xd97706,
  woodLog: 0x78350f,
  woodBark: 0x451a03,
  woodRings: 0xd97706,
} as const;

export type PaletteColorKey = keyof typeof PALETTE;

export function getPaletteHex(key: PaletteColorKey): number {
  return PALETTE[key];
}

export function getPaletteCss(key: PaletteColorKey): string {
  const hex = PALETTE[key];
  return '#' + hex.toString(16).padStart(6, '0');
}
