import { Building } from '../buildings/Building';
import { EventManager } from '../core/EventManager';
import { TimeManager } from '../core/TimeManager';
import { REWARDS } from '../data/rewards';
import { UNITS } from '../data/units';
import { ResourceManager } from '../economy/ResourceManager';
import { MatchResult } from '../game-modes/VictoryConditions';
import {
  DifficultyDef,
  MatchConfig,
  MatchHistoryEntry,
  MatchStats,
} from '../types';
import { Unit } from '../units/Unit';
import { AccountManager } from './AccountManager';
import { CurrencyManager } from './CurrencyManager';

export class RewardManager {
  // SPEC S4: MatchStats sayaçları
  private enemySoldiersKilled: number = 0;
  private friendlySoldiersLost: number = 0;
  private enemyBuildingsDestroyed: number = 0;
  private soldiersProduced: number = 0;

  private finalSurvivalTimeSec: number = 0;
  private finalBattleScore: number = 0;
  private finalAccountGoldEarned: number = 0;
  private isFinalized: boolean = false;
  private exitPenaltyApplied: boolean = false;

  private onUnitDiedBound: (data: { unit: Unit }) => void;
  private onBuildingDestroyedBound: (data: { building: Building }) => void;
  private onUnitProducedBound: (data: { unit: Unit }) => void;

  constructor(
    private config: MatchConfig,
    private difficulty: DifficultyDef,
    private accountManager: AccountManager,
    private currencyManager: CurrencyManager,
    private resourceManager?: ResourceManager,
    private timeManager?: TimeManager,
    private eventManager?: EventManager
  ) {
    this.onUnitDiedBound = ({ unit }: { unit: Unit }) => {
      if (!unit) return;
      const isWorker = UNITS[unit.defId]?.tags.includes('worker');
      if (!isWorker) {
        if (unit.team === 'enemy') {
          this.enemySoldiersKilled++;
        } else if (unit.team === 'player') {
          this.friendlySoldiersLost++;
        }
      }
    };

    this.onBuildingDestroyedBound = ({ building }: { building: Building }) => {
      if (!building) return;
      if (building.team === 'enemy') {
        this.enemyBuildingsDestroyed++;
      }
    };

    this.onUnitProducedBound = ({ unit }: { unit: Unit }) => {
      if (!unit) return;
      const isWorker = UNITS[unit.defId]?.tags.includes('worker');
      if (!isWorker && unit.team === 'player') {
        this.soldiersProduced++;
      }
    };

    if (this.eventManager) {
      this.eventManager.on('unitDied', this.onUnitDiedBound);
      this.eventManager.on('buildingDestroyed', this.onBuildingDestroyedBound);
      this.eventManager.on('unitProduced', this.onUnitProducedBound);
    }
  }

  // SPEC S4: Savaş puanı formülü
  // enemySoldiersKilled x REWARDS.killScore + enemyBuildingsDestroyed x REWARDS.buildingScore - friendlySoldiersLost x REWARDS.lostUnitScore (en az 0);
  // kazanana REWARDS.winBonusScore eklenir.
  public calculateBattleScore(result: MatchResult): number {
    const rawScore =
      this.enemySoldiersKilled * REWARDS.killScore +
      this.enemyBuildingsDestroyed * REWARDS.buildingScore -
      this.friendlySoldiersLost * REWARDS.lostUnitScore;

    const baseScore = Math.max(0, rawScore);
    return result === 'win' ? baseScore + REWARDS.winBonusScore : baseScore;
  }

  // SPEC S4: Çıkış (kullanıcı savaştan kendi isteğiyle çıkar)
  // sonuç 'exit' = mağlup sayılır; maç ödülü yoktur;
  // CurrencyManager.applyPenalty(REWARDS.exitPenaltyGold) uygulanır (bakiye 0'ın altına inmez);
  // savaş geçmişine mağlubiyet (result 'exit') kaydedilir;
  // ceza maç başına yalnızca BİR kez uygulanır.
  public async exitMatch(): Promise<MatchStats> {
    if (this.exitPenaltyApplied || this.isFinalized) {
      return this.getFinalStats();
    }
    this.exitPenaltyApplied = true;

    const survivalTimeSec = this.timeManager ? this.timeManager.matchClockRealSec : 0;
    return this.finalizeMatch('exit', survivalTimeSec);
  }

  // SPEC S4: finalizeMatch(result, survivalTimeSec)
  // Maç sonunda: ödül hesap altınına eklenir, MatchHistoryEntry kaydedilir,
  // Cehennem'de rekor güncellenir, SaveManager ile kayıt yapılır.
  public async finalizeMatch(
    result: MatchResult,
    survivalTimeSec: number
  ): Promise<MatchStats> {
    if (this.isFinalized) {
      return this.getFinalStats();
    }
    this.isFinalized = true;
    this.finalSurvivalTimeSec = survivalTimeSec;

    const battleScore = this.calculateBattleScore(result);
    this.finalBattleScore = battleScore;

    let accountGoldEarned = 0;
    let accountGoldDelta = 0;

    if (result === 'exit') {
      // Çıkışta maç ödülü yoktur; ceza uygulanır
      accountGoldEarned = 0;
      accountGoldDelta = -REWARDS.exitPenaltyGold;
    } else if (this.difficulty.id === 'cehennem') {
      // Cehennem = ulaşılan en yüksek eşiğin altını (eşik yoksa 0) + aşağı yuvarlanmış (battleScore / REWARDS.survivalScoreDivisor)
      let thresholdGold = 0;
      for (const th of REWARDS.survivalThresholds) {
        if (survivalTimeSec >= th.afterRealSec) {
          if (th.gold > thresholdGold) {
            thresholdGold = th.gold;
          }
        }
      }
      const scoreBonus = Math.floor(battleScore / REWARDS.survivalScoreDivisor);
      accountGoldEarned = thresholdGold + scoreBonus;
      accountGoldDelta = accountGoldEarned;
    } else if (result === 'win') {
      accountGoldEarned = this.difficulty.rewardGold || 0;
      accountGoldDelta = accountGoldEarned;
    } else if (result === 'loss') {
      accountGoldEarned = REWARDS.loseGold;
      accountGoldDelta = accountGoldEarned;
    } else if (result === 'draw') {
      accountGoldEarned = REWARDS.drawGold;
      accountGoldDelta = accountGoldEarned;
    }

    this.finalAccountGoldEarned = accountGoldEarned;

    // Cehennem'de rekor güncellemesi
    if (this.difficulty.id === 'cehennem') {
      await this.accountManager.setSurvivalRecord(this.config.mapId, survivalTimeSec);
    }

    // MatchHistoryEntry kaydı (AccountManager.recordMatch altın deltasını işler ve kaydeder)
    const historyEntry: MatchHistoryEntry = {
      dateIso: new Date().toISOString(),
      mapId: this.config.mapId,
      difficultyId: this.config.difficultyId,
      result,
      durationRealSec: survivalTimeSec,
      battleScore,
      accountGoldDelta,
    };

    await this.accountManager.recordMatch(historyEntry);

    return this.getFinalStats();
  }

  // SPEC S4 & S5: Güncel hesap altını sorgusu
  public getAccountGold(): number {
    return this.currencyManager.getGold();
  }

  // SPEC S4: getFinalStats() ile istatistikler okunur
  public getFinalStats(): MatchStats {
    const goldGathered = this.resourceManager
      ? this.resourceManager.getGoldGathered('player')
      : 0;
    const woodGathered = this.resourceManager
      ? this.resourceManager.getWoodGathered('player')
      : 0;

    return {
      enemySoldiersKilled: this.enemySoldiersKilled,
      friendlySoldiersLost: this.friendlySoldiersLost,
      enemyBuildingsDestroyed: this.enemyBuildingsDestroyed,
      goldGathered,
      woodGathered,
      soldiersProduced: this.soldiersProduced,
      survivalTimeSec: this.finalSurvivalTimeSec,
      battleScore: this.finalBattleScore,
      accountGoldEarned: this.finalAccountGoldEarned,
    };
  }

  public dispose(): void {
    if (this.eventManager) {
      this.eventManager.off('unitDied', this.onUnitDiedBound);
      this.eventManager.off('buildingDestroyed', this.onBuildingDestroyedBound);
      this.eventManager.off('unitProduced', this.onUnitProducedBound);
    }
  }
}
