import { EconomyManager, EconomyView } from '../economy/EconomyManager';

export class ResourcePanel {
  private element: HTMLElement;
  private goldEl: HTMLElement;
  private woodEl: HTMLElement;
  private popEl: HTMLElement;
  private workerEl: HTMLElement;
  private soldierEl: HTMLElement;

  private updateInterval: number | null = null;

  constructor(
    private parent: HTMLElement,
    private economyManager: EconomyManager
  ) {
    this.element = document.createElement('div');
    this.element.className = 'resource-panel';

    this.element.innerHTML = `
      <div class="resource-item resource-gold">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9"/><path d="M12 6v12M9 9h6"/></svg>
        Altın: <span data-field="gold">0</span>
      </div>
      <div class="resource-item resource-wood">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><ellipse cx="12" cy="12" rx="3" ry="9"/><path d="M12 3c4.97 0 9 4.03 9 9s-4.03 9-9 9"/></svg>
        Odun: <span data-field="wood">0</span>
      </div>
      <div class="resource-item resource-pop">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        Nüfus: <span data-field="pop">0 / 0</span>
      </div>
      <div class="resource-item resource-worker">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14.5 9.5l-9 9M4 20l2-2m14-12l-4-4-8 8 4 4 8-8z"/></svg>
        İşçi: <span data-field="worker">0</span>
      </div>
      <div class="resource-item resource-soldier">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2a9 9 0 0 1 9 9v3H3v-3a9 9 0 0 1 9-9z"/><path d="M3 14h18v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-3z"/></svg>
        Asker: <span data-field="soldier">0</span>
      </div>
    `;

    this.goldEl = this.element.querySelector('[data-field="gold"]') as HTMLElement;
    this.woodEl = this.element.querySelector('[data-field="wood"]') as HTMLElement;
    this.popEl = this.element.querySelector('[data-field="pop"]') as HTMLElement;
    this.workerEl = this.element.querySelector('[data-field="worker"]') as HTMLElement;
    this.soldierEl = this.element.querySelector('[data-field="soldier"]') as HTMLElement;

    this.parent.appendChild(this.element);

    this.update();

    // Saniyede yaklaşık 10 kez yenilenir (100 ms)
    this.updateInterval = window.setInterval(() => {
      this.update();
    }, 100);
  }

  public update(): void {
    const view: EconomyView = this.economyManager.getEconomyView('player');
    const totalWorkers = view.goldWorkers + view.woodWorkers;

    this.goldEl.textContent = view.gold.toString();
    this.woodEl.textContent = view.wood.toString();
    this.popEl.textContent = `${view.popUsed} / ${view.popCap}`;
    this.workerEl.textContent = totalWorkers.toString();
    this.soldierEl.textContent = view.soldiers.toString();
  }

  public destroy(): void {
    if (this.updateInterval !== null) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    if (this.element.parentElement) {
      this.element.parentElement.removeChild(this.element);
    }
  }
}
