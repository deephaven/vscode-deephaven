export type EventListener = <TEvent>(event: TEvent) => void;
export type UnsubscribeEventListener = () => void;

/**
 * General purpose event dispatcher for events that can be subscribed to.
 */
export class EventDispatcher<TEventName extends string> {
  private listeners: Map<string, Set<EventListener>> = new Map();

  /**
   * Register an event listener for a given event name.
   * @param eventName The name of the event to listen for.
   * @param listener The event listener to register.
   * @returns A function that can be called to unsubscribe the event listener.
   */
  addEventListener = (
    eventName: TEventName,
    listener: EventListener
  ): UnsubscribeEventListener => {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    this.listeners.get(eventName)?.add(listener);

    return () => {
      this.listeners.get(eventName)?.delete(listener);
    };
  };

  /**
   * Dispatch an event to all registered listeners.
   * @param eventName The name of the event to dispatch.
   * @param event The event to dispatch to all listeners
   */
  dispatchEvent = <TEvent>(eventName: TEventName, event?: TEvent): void => {
    this.listeners.get(eventName)?.forEach(listener => {
      listener(event);
    });
  };
}
