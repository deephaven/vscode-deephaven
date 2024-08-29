import type {
  EventListenerT,
  IEventDispatcher,
  UnsubscribeEventListener,
} from '../types';

/**
 * General purpose event dispatcher for events that can be subscribed to.
 * @deprecated Use `vscode.EventEmitter` instead.
 */
export class EventDispatcher<TEventName extends string>
  implements IEventDispatcher<TEventName>
{
  private listeners: Map<string, Set<EventListenerT>> = new Map();

  /**
   * Register an event listener for a given event name.
   * @param eventName The name of the event to listen for.
   * @param listener The event listener to register.
   * @returns A function that can be called to unsubscribe the event listener.
   */
  addEventListener = (
    eventName: TEventName,
    listener: EventListenerT
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
