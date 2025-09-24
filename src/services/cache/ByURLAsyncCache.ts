import * as vscode from 'vscode';
import type { IAsyncCacheService } from '../../types';
import { URLMap } from '../../util';

/**
 * Cache service that stores values by URL.
 */
export class ByURLAsyncCache<TValue>
  implements IAsyncCacheService<URL, TValue>
{
  constructor(loader: (url: URL) => Promise<TValue>) {
    this._loader = loader;
    this._promiseMap = new URLMap<Promise<TValue>>();
  }

  private readonly _onDidInvalidate = new vscode.EventEmitter<URL>();
  readonly onDidInvalidate = this._onDidInvalidate.event;

  private readonly _loader: (url: URL) => Promise<TValue>;
  private readonly _promiseMap = new URLMap<Promise<TValue>>();

  get = async (url: URL): Promise<TValue> => {
    if (!this._promiseMap.has(url)) {
      this._promiseMap.set(url, this._loader(url));
    }

    return this._promiseMap.get(url)!;
  };

  has = (url: URL): boolean => this._promiseMap.has(url);

  invalidate = (url: URL): void => {
    this._promiseMap.delete(url);
    this._onDidInvalidate.fire(url);
  };

  dispose = async (): Promise<void> => {
    this._onDidInvalidate.dispose();
    await this._promiseMap.dispose();
  };
}
