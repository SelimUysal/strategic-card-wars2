import { MATCH_RULES } from '../data/matchRules';

export class CurrencyManager {
  private gold: number = MATCH_RULES.startAccountGold;
  private changeListeners: Array<() => void> = [];

  // SPEC S4: canAfford(amount)
  public canAfford(amount: number): boolean {
    return amount >= 0 && this.gold >= amount;
  }

  // SPEC S4: add(amount)
  public add(amount: number): void {
    if (amount > 0) {
      this.gold += amount;
      this.notifyChanged();
    }
  }

  // SPEC S4: spend(amount)
  public spend(amount: number): boolean {
    if (!this.canAfford(amount)) {
      return false;
    }
    this.gold -= amount;
    this.notifyChanged();
    return true;
  }

  // SPEC S4: applyPenalty(amount) (bakiye 0'ın altına inmez; hiçbir zaman negatif olmaz)
  public applyPenalty(amount: number): void {
    if (amount > 0) {
      this.gold = Math.max(0, this.gold - amount);
      this.notifyChanged();
    }
  }

  public getGold(): number {
    return this.gold;
  }

  public setGold(amount: number): void {
    this.gold = Math.max(0, amount);
    this.notifyChanged();
  }

  public onChange(listener: () => void): () => void {
    this.changeListeners.push(listener);
    return () => {
      this.changeListeners = this.changeListeners.filter((l) => l !== listener);
    };
  }

  private notifyChanged(): void {
    for (const l of this.changeListeners) {
      l();
    }
  }
}
