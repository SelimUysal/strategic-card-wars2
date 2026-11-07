// GEÇİCİ: Adım 13B Test Başlatıcısı (Adım 15'te silinecektir)
import './styles/main.css';
import { Game } from './core/Game';
import { ENEMY_IDS } from './data/enemies';
import { DEFAULT_PLAYER_FACTION, HELL_FACTIONS } from './data/factions';
import { MAPS } from './data/maps';
import { CommanderId, DifficultyId, EnemyId, FactionId, MapId, MatchConfig } from './types';

// SPEC S2: Cehennem dışı modlarda ENEMY_IDS'den tohumla deterministik rastgele düşman seçimi
function pickEnemyFaction(seed: number): EnemyId {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const rnd = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  const index = Math.floor(rnd * ENEMY_IDS.length);
  return ENEMY_IDS[index];
}

const app = document.getElementById('app');
if (app) {
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  app.appendChild(canvas);

  const game = new Game(canvas);

  // SPEC S4: Adres çubuğunda ?map=<mapId>&difficulty=<difficultyId> varsa MatchConfig oluşturur
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    const rawMapParam = urlParams.get('map') as MapId | null;
    const rawDifficultyParam = urlParams.get('difficulty') as DifficultyId | null;
    const commanderParam = urlParams.get('commander') as CommanderId | null;
    const autoPlayerParam = urlParams.get('autoplayer');

    const validDifficulties: DifficultyId[] = ['kolay', 'normal', 'zor', 'cehennem'];

    const mapParam: MapId = rawMapParam && MAPS[rawMapParam] ? rawMapParam : 'rumeli_ovasi';
    const difficultyParam: DifficultyId =
      rawDifficultyParam && validDifficulties.includes(rawDifficultyParam)
        ? rawDifficultyParam
        : 'kolay';

    if (
      MAPS[mapParam] &&
      validDifficulties.includes(difficultyParam)
    ) {
      // AccountManager.load ile yüklenen profili kullan
      game
        .getAccountManager()
        .load()
        .then(() => {
          const seed = Math.floor(Math.random() * 1000000);
          const isCehennem = difficultyParam === 'cehennem';

          // SPEC S2: Taraf ve komutan seçimi
          const playerFactionId: FactionId = isCehennem
            ? HELL_FACTIONS.player
            : DEFAULT_PLAYER_FACTION;

          const enemyFactionId: FactionId = isCehennem
            ? HELL_FACTIONS.enemy
            : pickEnemyFaction(seed);

          const playerCommanderId: CommanderId | null = isCehennem
            ? null
            : commanderParam || 'fatih';

          const enemyCommanderId: CommanderId | null = isCehennem
            ? null
            : game.getCommanderManager().pickRandomEnemyCommander(seed);

          const matchConfig: MatchConfig = {
            mapId: mapParam,
            difficultyId: difficultyParam,
            playerCommanderId,
            playerFactionId,
            enemyFactionId,
            enemyCommanderId,
            seed,
          };

          const isAutoPlayer = autoPlayerParam === '1';
          game.startMatch(matchConfig, isAutoPlayer);
        });
    }
  }

  game.start();
}
