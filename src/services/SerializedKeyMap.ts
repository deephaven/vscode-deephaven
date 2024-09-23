/**
 * Base class for Maps that need to store their keys as serialized string values
 * internally for equality checks. Externally, the keys are deserialized back to
 * their original type. Note that the implementation of `deserializeKey` will
 * determine whether keys with the same serialized value maintain reference
 * equality (in most cases they will not).
 *
 * // New reference on every call
 * e.g. deserializeKey = (key: string) => new URL(key)
 */
export abstract class SerializedKeyMap<TKey, TValue> {
  constructor();
  constructor(entries: readonly (readonly [TKey, TValue])[] | null);
  constructor(entries?: readonly (readonly [TKey, TValue])[] | null) {
    this._map = new Map(
      entries?.map(([key, value]) => [this.serializeKey(key), value])
    );
  }

  private readonly _map: Map<string, TValue>;

  /** Serialize from a key to a string. */
  protected abstract serializeKey(key: TKey): string;

  /** Deserialize from a string to a key. */
  protected abstract deserializeKey(key: string): TKey;

  clear(): void {
    this._map.clear();
  }

  get(key: TKey): TValue | undefined {
    return this._map.get(this.serializeKey(key));
  }

  set(key: TKey, value: TValue): this {
    this._map.set(this.serializeKey(key), value);
    return this;
  }

  has(key: TKey): boolean {
    return this._map.has(this.serializeKey(key));
  }

  delete(key: TKey): boolean {
    return this._map.delete(this.serializeKey(key));
  }

  forEach(
    callback: (value: TValue, key: TKey, map: Map<TKey, TValue>) => void,
    thisArg?: any
  ): void {
    this._map.forEach((value, key) => {
      callback(value, this.deserializeKey(key), thisArg);
    }, thisArg);
  }

  *entries(): IterableIterator<[TKey, TValue]> {
    for (const [key, value] of this._map.entries()) {
      yield [this.deserializeKey(key), value];
    }
  }

  *keys(): IterableIterator<TKey> {
    for (const key of this._map.keys()) {
      yield this.deserializeKey(key);
    }
  }

  values(): IteratorObject<TValue> {
    return this._map.values();
  }
}
