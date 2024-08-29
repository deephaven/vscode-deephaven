import type { Disposable } from '../types';

export type Runner = () => Promise<void>;

/**
 * Service that polls a function at a minimum interval.
 */
export class PollingService implements Disposable {
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
