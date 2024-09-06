import { PollingService } from '../services';

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
 * Return a Promise that resolves after a given number of milliseconds.
 * @param waitMs
 */
export function waitFor(waitMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, waitMs));
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
