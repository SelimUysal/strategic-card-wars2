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
      <div class="resource-item resource-gold">Altın: <span data-field="gold">0</span></div>
      <div class="resource-item resource-wood">Odun: <span data-field="wood">0</span></div>
      <div class="resource-item resource-pop">Nüfus: <span data-field="pop">0 / 0</span></div>
      <div class="resource-item resource-worker">İşçi: <span data-field="worker">0</span></div>
      <div class="resource-item resource-soldier">Asker: <span data-field="soldier">0</span></div>
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
