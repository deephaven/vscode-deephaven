export class CacheService<T> {
  constructor(
    label: string,
    loader: (key: string | null) => Promise<T>,
    normalizeKey: (key: string | null) => string | null
  ) {
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

  public clearCache(): void {
    this.cachedPromises.clear();
  }
}
