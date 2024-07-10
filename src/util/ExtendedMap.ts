/**
 * ExtendedMap is a Map with additional utility methods.
 */
export class ExtendedMap<K, V> extends Map<K, V> {
  /**
   * Return the value for the key if it exists, otherwise throw an error.
   * @param key
   * @returns
   */
  getOrThrow = (key: K): V => {
    if (!this.has(key)) {
      throw new Error(`Key not found: ${key}`);
    }

    return this.get(key)!;
  };
}
