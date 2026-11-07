import { Team } from '../types';
import { UnitManager } from '../units/UnitManager';

export interface PeriodicHealConfig {
  team: Team;
  everySec: number;
  pct: number;
  timer: number;
}

export class CommanderAbilities {
  private periodicHeals: PeriodicHealConfig[] = [];

  constructor(private unitManager?: UnitManager) {}

  public setUnitManager(unitManager: UnitManager): void {
    this.unitManager = unitManager;
  }

  // SPEC S4: periodicHealPct etkisi zamanlayıcı kaydı
  public registerPeriodicHeal(team: Team, everySec: number, pct: number): void {
    // Aynı takım için önceki kaydı kaldırıp temizle (aynı komutanın bonusu iki kez eklenmez)
    this.periodicHeals = this.periodicHeals.filter((h) => h.team !== team);
    this.periodicHeals.push({
      team,
      everySec,
      pct,
      timer: 0,
    });
  }

  // SPEC S4: Zamanlayıcı simülasyon dt'siyle çalışır (oyun hızından etkilenir)
  public update(simDt: number): void {
    if (!this.unitManager || this.periodicHeals.length === 0) return;

    for (const heal of this.periodicHeals) {
      heal.timer += simDt;
      while (heal.timer >= heal.everySec) {
        heal.timer -= heal.everySec;
        this.applyPeriodicHeal(heal.team, heal.pct);
      }
    }
  }

  // SPEC S4: o takımın TÜM canlı askerlerine (işçiler hariç) maksimum canlarının pct'si kadar can ekler; can maksimumu aşmaz
  private applyPeriodicHeal(team: Team, pct: number): void {
    if (!this.unitManager) return;

    const soldiers = this.unitManager.getSoldiers(team);
    for (const soldier of soldiers) {
      if (soldier.state !== 'dead' && soldier.hp > 0 && soldier.hp < soldier.maxHp) {
        const healAmount = Math.round(soldier.maxHp * pct);
        soldier.hp = Math.min(soldier.maxHp, soldier.hp + healAmount);
      }
    }
  }

  // SPEC S3: removeAll ile çağrılır
  public clear(): void {
    this.periodicHeals = [];
  }

  public getPeriodicHeals(): PeriodicHealConfig[] {
    return [...this.periodicHeals];
  }
}
