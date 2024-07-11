import { Disposable } from '../common';
import { isDisposable } from '../util';
import { EventDispatcher } from './EventDispatcher';

export class CacheService<T, TEventName extends string>
  extends EventDispatcher<TEventName>
  implements Disposable
{
  constructor(
    label: string,
    loader: (key: string | null) => Promise<T>,
    normalizeKey: (key: string | null) => string | null
  ) {
    super();

    this.label = label;
    this.loader = loader;
    this.normalizeKey = normalizeKey;
  }

  private label: string;
  private cachedPromises: Map<string | null, Promise<T>> = new Map();
  private loader: (key: string | null) => Promise<T>;
  private normalizeKey: (key: string | null) => string | null;

  public async get(key: string | null): Promise<T> {
    const normalizeKey = this.normalizeKey(key);

    if (!this.cachedPromises.has(normalizeKey)) {
      console.log(`${this.label}: caching key: ${normalizeKey}`);
      // Note that we cache the promise itself, not the result of the promise.
      // This helps ensure the loader is only called the first time `get` is
      // called.
      this.cachedPromises.set(normalizeKey, this.loader(normalizeKey));
    }

    return this.cachedPromises.get(normalizeKey)!;
  }

  public async clearCache(): Promise<void> {
    try {
      const allValues = await Promise.all([...this.cachedPromises.values()]);

      // Since the cache is responsible for creating the promises, it is also
      // responsible for disposing of them.
      allValues.forEach(value => {
        if (isDisposable(value)) {
          value.dispose();
        }
      });
    } catch (err) {
      console.error('An error occurred while disposing cached values:', err);
    }

    this.cachedPromises.clear();
  }

  public async dispose(): Promise<void> {
    await this.clearCache();
  }
}
