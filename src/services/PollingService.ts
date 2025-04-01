import type { IDisposable } from '../types';
import { withResolvers, type PromiseWithCancel } from '../util';

export type Runner = () => Promise<void>;

/**
 * Service that polls a function at a minimum interval.
 */
export class PollingService implements IDisposable {
  private _timeout?: NodeJS.Timeout;

  private _isRunning = false;
  get isRunning(): boolean {
    return this._isRunning;
  }

  start = (run: () => Promise<void>, minInterval: number): void => {
    this.stop();

    this._isRunning = true;

    const poll = async (): Promise<void> => {
      if (!this._isRunning) {
        return;
      }

      const start = performance.now();

      await run();

      if (!this._isRunning) {
        return;
      }

      // Ensure checks don't run more often than the interval
      const elapsed = performance.now() - start;
      const remaining = minInterval - elapsed;
      const wait = Math.max(0, remaining);

      this._timeout = setTimeout(poll, wait);
    };

    // Schedule first poll after current event loop. This avoids certain kinds
    // of stack overflows if the polling function is started inside of function
    // that is also called within the polling function.
    setTimeout(() => {
      poll();
    }, 0);
  };

  stop = (): void => {
    this._isRunning = false;
    clearTimeout(this._timeout);
  };

  dispose = async (): Promise<void> => {
    this.stop();
  };
}

/**
 * Call the given poll function at an interval.
 * - If the poll result resolves to true, stop polling and resolve the promise.
 * - If the poll function throws, stop polling and reject the promise.
 * @param poll
 * @param intervalMs
 * @param timeoutMs
 * @returns Promise that resolves when the poll function returns true + a `reject`
 * function that can be used to cancel the polling.
 */
export function pollUntilTrue(
  poll: () => Promise<boolean>,
  intervalMs: number,
  timeoutMs?: number
): PromiseWithCancel<true> {
  const { promise, resolve, reject } = withResolvers<true>();

  let timeout: NodeJS.Timeout;
  const poller = new PollingService();

  /** Stop polling and resolve / reject promise */
  function resolveOrReject(trueOrError: true | Error): void {
    poller.stop();
    clearTimeout(timeout);

    if (trueOrError === true) {
      resolve(trueOrError);
    } else {
      reject(trueOrError);
    }
  }

  /** Cancel polling */
  const cancel = (): void => {
    resolveOrReject(new Error('Polling cancelled'));
  };

  if (timeoutMs != null) {
    timeout = setTimeout(() => {
      cancel();
    }, timeoutMs);
  }

  poller.start(async () => {
    try {
      const isTrue = await poll();
      if (isTrue) {
        resolveOrReject(true);
      }
    } catch (err) {
      resolveOrReject(err instanceof Error ? err : new Error(String(err)));
    }
  }, intervalMs);

  return {
    promise,
    cancel,
  };
}
