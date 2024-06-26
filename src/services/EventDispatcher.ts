export type EventHandler = <TEvent>(event: TEvent) => void;
export type UnsubscribeEventHandler = () => void;

export class EventDispatcher<TEventName extends string> {
  private listeners: Map<string, Set<EventHandler>> = new Map();

  addEventListener = (
    eventName: TEventName,
    handler: EventHandler
  ): UnsubscribeEventHandler => {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    this.listeners.get(eventName)?.add(handler);

    return () => {
      this.listeners.get(eventName)?.delete(handler);
    };
  };

  dispatchEvent = <TEvent>(eventName: TEventName, event?: TEvent) => {
    this.listeners.get(eventName)?.forEach(handler => handler(event));
  };
}
