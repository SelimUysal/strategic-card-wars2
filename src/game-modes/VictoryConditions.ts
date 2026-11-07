import { Building } from '../buildings/Building';
import { BuildingManager } from '../buildings/BuildingManager';
import { EventManager } from '../core/EventManager';
import { TimeManager } from '../core/TimeManager';
import { DifficultyId, Team } from '../types';

export type MatchResult = 'win' | 'loss' | 'draw' | 'exit';

export interface MatchEndedEvent {
  result: MatchResult;
  survivalTimeSec: number;
}

export class VictoryConditions {
  private difficultyId: DifficultyId = 'normal';
  private isMatchOver: boolean = false;
  private destroyedHqsInStep: Set<Team> = new Set();
  private onHqDestroyedBound: (data: { team: Team; building: Building }) => void;
  private onBuildingPlacedBound: (data: { building: Building }) => void;

  constructor(
    private buildingManager: BuildingManager,
    private timeManager: TimeManager,
    private eventManager: EventManager
  ) {
    this.onHqDestroyedBound = ({ team }) => {
      if (this.isMatchOver) return;
      this.destroyedHqsInStep.add(team);
    };

    this.onBuildingPlacedBound = ({ building }) => {
      // Cehennem modunda düşman HQ'su oluşunca minHp = 1 ayarla
      if (
        this.difficultyId === 'cehennem' &&
        building.team === 'enemy' &&
        building.defId === 'hq'
      ) {
        building.minHp = 1;
      }
    };

    this.eventManager.on('hqDestroyed', this.onHqDestroyedBound);
    this.eventManager.on('buildingPlaced', this.onBuildingPlacedBound);
  }

  // SPEC S2: Maç başlangıcında zorluk ayarı ve Cehennem kuralı
  public setupMatch(difficultyId: DifficultyId): void {
    this.difficultyId = difficultyId;
    this.isMatchOver = false;
    this.destroyedHqsInStep.clear();

    // Cehennem: Düşman ana karargâhının minHp değeri 1'dir:
    // canı 1'e kadar düşer, 1'e ulaşınca artık hasar almaz, hiçbir zaman yıkılmaz
    if (this.difficultyId === 'cehennem') {
      const enemyHq = this.buildingManager.getHq('enemy');
      if (enemyHq) {
        enemyHq.minHp = 1;
      }
    }
  }

  // SPEC S2: update(dt) simülasyon adımı sonunda HQ yıkımlarını değerlendirir
  // Kolay, Normal, Zor: iki karargâh AYNI simülasyon adımında yıkılırsa beraberlik
  public update(_dt: number): void {
    if (this.isMatchOver) return;

    if (this.destroyedHqsInStep.size > 0) {
      if (this.difficultyId === 'cehennem') {
        // Cehennem: yalnızca oyuncunun ana karargâhı yıkılınca maç biter (sonuç 'loss')
        if (this.destroyedHqsInStep.has('player')) {
          this.endMatch('loss');
        }
      } else {
        // Kolay, Normal, Zor:
        if (this.destroyedHqsInStep.has('player') && this.destroyedHqsInStep.has('enemy')) {
          this.endMatch('draw');
        } else if (this.destroyedHqsInStep.has('player')) {
          this.endMatch('loss');
        } else if (this.destroyedHqsInStep.has('enemy')) {
          this.endMatch('win');
        }
      }

      this.destroyedHqsInStep.clear();
    }
  }

  // SPEC S2: Maç bitince 'matchEnded' olayı yayınlanır; sonrakiler yok sayılır
  public endMatch(result: MatchResult): void {
    if (this.isMatchOver) {
      return;
    }
    this.isMatchOver = true;

    const survivalTimeSec = this.timeManager.matchClockRealSec;
    const eventPayload: MatchEndedEvent = {
      result,
      survivalTimeSec,
    };

    this.eventManager.emit('matchEnded', eventPayload);
  }

  public isOver(): boolean {
    return this.isMatchOver;
  }

  public dispose(): void {
    this.eventManager.off('hqDestroyed', this.onHqDestroyedBound);
    this.eventManager.off('buildingPlaced', this.onBuildingPlacedBound);
  }
}
