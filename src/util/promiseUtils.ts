import * as vscode from 'vscode';

export interface PromiseWithResolvers<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

export interface PromiseWithCancel<T> {
  promise: Promise<T>;
  cancel: () => void;
}

/**
 * Return a Promise that rejects after a given number of milliseconds.
 * @param timeoutMs Timeout in milliseconds
 * @param reason Rejection reason
 * @param disposables Optional array of disposables. If provided, add a
 * disposable to clear the timeout when the subscriptions are disposed.
 * @returns A Promise that rejects after the given timeout
 */
export function rejectAfterTimeout(
  timeoutMs: number,
  reason: string,
  disposables?: vscode.Disposable[]
): Promise<never> {
  let timeoutId: NodeJS.Timeout;

  disposables?.push({
    dispose: () => {
      clearTimeout(timeoutId);
    },
  });

  return new Promise<never>(
    (_, reject) => (timeoutId = setTimeout(() => reject(reason), timeoutMs))
  );
}

/**
 * Return a Promise that resolves after a given number of milliseconds.
 * @param waitMs
 */
export function waitFor(waitMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, waitMs));
}

/**
 * Wait for an event to fire once on a target object.
 * @param target Object with addEventListener/removeEventListener methods
 * @param eventName Name of the event to wait for
 * @returns Promise that resolves when the event fires
 */
export function waitForEvent<
  T extends { addEventListener: Function; removeEventListener: Function },
>(target: T, eventName: string): Promise<void> {
  const { promise, resolve } = withResolvers<void>();

  const handler = (): void => {
    target.removeEventListener(eventName, handler);
    resolve();
  };

  target.addEventListener(eventName, handler);

  return promise;
}

/**
 * Polyfill for `Promise.withResolvers`. Should be able to replace once we
 * upgrade to Node 22.
 * @returns
 */
export function withResolvers<T>(): PromiseWithResolvers<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: any) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

export interface ThrottledTrigger {
  /** Request a run: immediate when idle, coalesced while cooling down. */
  trigger: () => void;
  /** Drop any pending trailing run. */
  dispose: () => void;
}

/**
 * Wrap a callback so it runs at most once per `intervalMs`: immediately on the
 * leading edge of a burst, then once more at the end of the window if further
 * triggers arrived during it.
 *
 * Deliberately a throttle and not a plain debounce. A source that never goes
 * quiet — a ticking table on a busy server — would reset a debounce timer
 * forever and the callback would never run at all.
 * @param callback The callback to rate limit.
 * @param intervalMs Minimum milliseconds between runs.
 */
export function createThrottledTrigger(
  callback: () => void,
  intervalMs: number
): ThrottledTrigger {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let isPending = false;

  const run = (): void => {
    callback();

    timeout = setTimeout(() => {
      timeout = undefined;

      if (isPending) {
        isPending = false;
        run();
      }
    }, intervalMs);
  };

  return {
    trigger: (): void => {
      if (timeout == null) {
        run();
        return;
      }

      isPending = true;
    },
    dispose: (): void => {
      clearTimeout(timeout);
      timeout = undefined;
      isPending = false;
    },
  };
}
