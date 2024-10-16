import type { IAsyncCacheService } from '../../types';
import { isDisposable } from '../../util';
import { URLMap } from '../URLMap';

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
  };

  dispose = async (): Promise<void> => {
    const promises = [...this._promiseMap.values()];
    this._promiseMap.clear();

    // Values have to be resolved before they can be disposed.
    const disposing = promises.map(async promise => {
      const resolved = await promise;
      if (isDisposable(resolved)) {
        await resolved.dispose();
      }
    });

    await Promise.all(disposing);
  };
}
