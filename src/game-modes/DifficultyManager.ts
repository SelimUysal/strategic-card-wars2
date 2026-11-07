import { EnemyAI, EnemyAIDependencies } from '../ai/EnemyAI';
import { CardManager } from '../cards/CardManager';
import { DIFFICULTIES } from '../data/difficulties';
import { MATCH_RULES } from '../data/matchRules';
import { ResourceManager } from '../economy/ResourceManager';
import { DifficultyDef, DifficultyId, MatchConfig } from '../types';

export class DifficultyManager {
  // SPEC S1: getDifficulty(id)
  public static getDifficulty(id: DifficultyId): DifficultyDef {
    const diff = DIFFICULTIES[id];
    if (!diff) {
      throw new Error(`Geçersiz zorluk ID: ${id}`);
    }
    return diff;
  }

  public getDifficulty(id: DifficultyId): DifficultyDef {
    return DifficultyManager.getDifficulty(id);
  }

  // SPEC S1: applyToMatch(config, deps)
  // Düşman için:
  // - ResourceManager.init(enemy, enemyStartGold, enemyStartWood, enemyPopCap)
  // - CardManager.setEnemyCardIds(enemyCardIds)
  // - EnemyAI'yı zorluk parametreleriyle kurar
  // Oyuncunun başlangıç kaynağı her modda MATCH_RULES'tandır (500 / 500 / 60)
  // Dört zorluk harita seçiminden bağımsızdır (16 harita-zorluk kombinasyonu desteklenir)
  public applyToMatch(
    config: MatchConfig,
    deps: {
      resourceManager: ResourceManager;
      cardManager: CardManager;
      enemyAiDeps?: EnemyAIDependencies;
    }
  ): { difficulty: DifficultyDef; enemyAI?: EnemyAI } {
    const difficulty = this.getDifficulty(config.difficultyId);

    // 1. Oyuncunun başlangıç kaynakları her modda MATCH_RULES'tandır (500 / 500 / 60)
    deps.resourceManager.init(
      'player',
      MATCH_RULES.playerStartGold,
      MATCH_RULES.playerStartWood,
      MATCH_RULES.popCap
    );

    // 2. Düşman için zorluk parametreleriyle kaynak ve nüfus sınırı
    deps.resourceManager.init(
      'enemy',
      difficulty.enemyStartGold,
      difficulty.enemyStartWood,
      difficulty.enemyPopCap
    );

    // 3. Kart yöneticisine düşman kartları atanır
    deps.cardManager.setEnemyCardIds(difficulty.enemyCardIds);

    // 4. EnemyAI kurulumu (bağımlılıklar sağlanmışsa)
    let enemyAI: EnemyAI | undefined;
    if (deps.enemyAiDeps) {
      enemyAI = new EnemyAI(
        difficulty,
        difficulty.enemyCardIds,
        deps.enemyAiDeps,
        'enemy'
      );
    }

    return { difficulty, enemyAI };
  }
}
