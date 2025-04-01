import * as vscode from 'vscode';
import type { IDisposable } from '../types';
import { Logger } from '../util';

/** Base class for disposing of dependencies. */
export abstract class DisposableBase implements IDisposable {
  constructor() {
    this._logger = new Logger(`${this.constructor.name}: DisposableBase`);
  }

  protected readonly disposables = new Set<
    (() => void) | IDisposable | vscode.Disposable
  >();
  private readonly _logger: Logger;

  private _isDisposed = false;
  private _isDisposing = false;
  private _disposalPromise: Promise<any> | undefined;

  /**
   * Dispose of dependencies. Returns immediately if already called.
   * @returns Promise that resolves when disposal is complete.
   */
  async dispose(): Promise<void> {
    if (this._isDisposing) {
      this._logger.debug2('Already disposing');
      return this._disposalPromise;
    }

    if (this._isDisposed) {
      this._logger.debug2('Already disposed');
      return this._disposalPromise;
    }

    this._logger.debug2('Disposing');
    this._isDisposing = true;
    await this.onDisposing();

    this._logger.debug2(`Disposing ${this.disposables.size} disposables`);
    const disposing = [...this.disposables].map(disposable =>
      typeof disposable === 'function' ? disposable() : disposable.dispose()
    );
    this.disposables.clear();

    this._disposalPromise = Promise.all(disposing);

    await this._disposalPromise;

    this._isDisposed = true;
    this._isDisposing = false;
  }

  /** Override this method to call additional disposal logic. */
  protected async onDisposing(): Promise<void> {}
}
