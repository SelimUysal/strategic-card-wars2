type EventHandler<T = any> = (data: T) => void;

export class EventManager {
  private listeners: Map<string, Set<EventHandler>> = new Map();

  public on<T = any>(event: string, handler: EventHandler<T>): void {
    let handlers = this.listeners.get(event);
    if (!handlers) {
      handlers = new Set();
      this.listeners.set(event, handlers);
    }
    handlers.add(handler);
  }

  public off<T = any>(event: string, handler: EventHandler<T>): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  public emit<T = any>(event: string, data?: T): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of Array.from(handlers)) {
        handler(data);
      }
    }
  }

  public clear(): void {
    this.listeners.clear();
  }
}
