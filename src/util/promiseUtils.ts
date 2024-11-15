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
