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
