import * as vscode from 'vscode';
import type { IDisposable } from '../types';
import { Logger, withResolvers } from '../util';

/** Base class for disposing of dependencies. */
export abstract class DisposableBase implements IDisposable {
  constructor() {
    this._logger = new Logger(`${this.constructor.name}: DisposableBase`);
  }

  protected readonly disposables = new Set<
    (() => void) | IDisposable | vscode.Disposable
  >();
  private readonly _logger: Logger;

  private _disposalPromise: Promise<any> | undefined;

  /**
   * Dispose of dependencies. Returns immediately if already called.
   * @returns Promise that resolves when disposal is complete.
   */
  async dispose(): Promise<void> {
    if (this._disposalPromise != null) {
      this._logger.debug2('Dispose already called');
      return this._disposalPromise;
    }

    const { promise, resolve } = withResolvers<void>();
    this._disposalPromise = promise;

    this._logger.debug2('Disposing');
    await this.onDisposing();

    this._logger.debug2(`Disposing ${this.disposables.size} disposables`);
    const disposing = [...this.disposables].map(disposable =>
      typeof disposable === 'function' ? disposable() : disposable.dispose()
    );
    this.disposables.clear();

    await Promise.all(disposing);
    resolve();

    return this._disposalPromise;
  }

  /** Override this method to call additional disposal logic. */
  protected async onDisposing(): Promise<void> {}
}
