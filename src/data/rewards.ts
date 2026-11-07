// Savaş puanı = öldürülen düşman askeri x killScore + yıkılan düşman binası x buildingScore - kaybedilen dost askeri x lostUnitScore (en az 0); kazanana winBonusScore eklenir. Cehennem ödülü = ulaşılan en yüksek eşiğin altını + yuvarlanmış aşağı (savaş puanı / survivalScoreDivisor).
export const REWARDS = {
  loseGold: 20,
  drawGold: 50,
  exitPenaltyGold: 50,
  winBonusScore: 500,
  killScore: 10,
  buildingScore: 50,
  lostUnitScore: 5,
  survivalThresholds: [
    { afterRealSec: 300, gold: 100 },
    { afterRealSec: 600, gold: 250 },
    { afterRealSec: 1200, gold: 500 },
  ],
  survivalScoreDivisor: 50,
} as const;
