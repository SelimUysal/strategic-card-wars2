import './styles/main.css';
import { Game } from './core/Game';
import { MATCH_RULES } from './data/matchRules';
import { SaveManager } from './progression/SaveManager';
import { MainMenu } from './ui/MainMenu';

const app = document.getElementById('app');
if (app) {
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  app.appendChild(canvas);

  // S1 & S2: ?test=1 parametresini oku; allowTestMode true ise TEST MODU aktiftir
  const urlParams = new URLSearchParams(window.location.search);
  const isTestMode = Boolean(MATCH_RULES.allowTestMode && urlParams.get('test') === '1');

  // SaveManager'a bildir (S2 & S3)
  SaveManager.setTestMode(isTestMode);

  // S4: Test modunda ekranın bir köşesinde sürekli küçük 'TEST MODU' etiketi
  if (isTestMode) {
    const testBadge = document.createElement('div');
    testBadge.className = 'test-mode-badge';
    testBadge.textContent = 'TEST MODU';
    document.body.appendChild(testBadge);
  }

  const game = new Game(canvas);
  game.getAccountManager().setTestMode(isTestMode);

  if (isTestMode) {
    MainMenu.setOnResetTestProfile(async () => {
      await game.getAccountManager().resetTestProfile();
      game.showMainMenu();
    });
  }

  game
    .getAccountManager()
    .load()
    .then(() => {
      game.showMainMenu();
    });

  game.start();
}

