import * as vscode from 'vscode';
import type { IDisposable } from '../../types';

/**
 * Base class for Sets that need to store their keys as serialized string values
 * internally for equality checks. Externally, the keys are deserialized back to
 * their original type. Note that the implementation of `deserializeKey` will
 * determine whether keys with the same serialized value maintain reference
 * equality (in most cases they will not).
 *
 * // New reference on every call
 * e.g. deserializeKey = (key: string) => new URL(key)
 */
export abstract class SerializedKeySet<TKey> implements IDisposable {
  constructor();
  constructor(entries: readonly TKey[] | null);
  constructor(entries?: readonly TKey[] | null) {
    this._set = new Set(entries?.map(key => this.serializeKey(key)));

    this.add = this.add.bind(this);
    this.clear = this.clear.bind(this);
    this.delete = this.delete.bind(this);
    this.dispose = this.dispose.bind(this);
    this.forEach = this.forEach.bind(this);
    this.has = this.has.bind(this);
    this.entries = this.entries.bind(this);
    this.keys = this.keys.bind(this);
    this.values = this.values.bind(this);
  }

  private readonly _onDidChange = new vscode.EventEmitter<TKey>();
  readonly onDidChange = this._onDidChange.event;

  private readonly _set: Set<string>;

  /** Serialize from a key to a string. */
  protected abstract serializeKey(key: TKey): string;

  /** Deserialize from a string to a key. */
  protected abstract deserializeKey(key: string): TKey;

  add(key: TKey): this {
    const serializedKey = this.serializeKey(key);
    if (!this._set.has(serializedKey)) {
      this._set.add(serializedKey);
      this._onDidChange.fire(key);
    }
    return this;
  }

  clear(): void {
    const keys = [...this.keys()];
    this._set.clear();
    keys.forEach(key => this._onDidChange.fire(key));
  }

  delete(key: TKey): boolean {
    const deleted = this._set.delete(this.serializeKey(key));

    if (deleted) {
      this._onDidChange.fire(key);
    }

    return deleted;
  }

  async dispose(): Promise<void> {
    this._onDidChange.dispose();
    this._set.clear();
  }

  forEach(callback: (value: TKey, key: TKey, set: this) => void): void {
    this._set.forEach((_value, key) => {
      const deserializedKey = this.deserializeKey(key);
      callback(deserializedKey, deserializedKey, this);
    });
  }

  has(key: TKey): boolean {
    return this._set.has(this.serializeKey(key));
  }

  get size(): number {
    return this._set.size;
  }

  *entries(): IterableIterator<[TKey, TKey]> {
    for (const [key] of this._set.entries()) {
      const deserializedKey = this.deserializeKey(key);
      yield [deserializedKey, deserializedKey];
    }
  }

  *keys(): IterableIterator<TKey> {
    for (const key of this._set.keys()) {
      yield this.deserializeKey(key);
    }
  }

  *values(): IterableIterator<TKey> {
    yield* this.keys();
  }
}
