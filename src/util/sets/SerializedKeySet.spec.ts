import { describe, it, expect, vi } from 'vitest';
import { SerializedKeySet } from './SerializedKeySet';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

const deserializeKey = (key: string): Object => JSON.parse(key);
const serializeKey = (key: Object): string => JSON.stringify(key);

describe('SerializedKeySet', () => {
  class JsonKeySet extends SerializedKeySet<Object> {
    deserializeKey = deserializeKey;
    serializeKey = serializeKey;
  }

  const keyA = () => ({ a: 1 }) as const;
  const keyB = () => ({ b: 2 }) as const;

  it('should key data by value equality', () => {
    const instance = new JsonKeySet();

    expect(instance.has(keyA())).toBe(false);

    instance.add(keyA());

    expect(instance.has(keyA())).toBe(true);

    instance.delete(keyA());
    expect(instance.has(keyA())).toBe(false);
  });

  describe('entries', () => {
    it('should provide value equality entries', () => {
      const instance = new JsonKeySet();

      const a = keyA();
      const b = keyB();

      instance.add(a);
      instance.add(b);

      const entries = Array.from(instance.entries());

      expect(entries[0]).not.toBe(a);
      expect(entries[1]).not.toBe(b);
      expect(entries).toEqual([
        [a, a],
        [b, b],
      ]);
    });
  });

  describe('keys', () => {
    it('should provide value equality keys', () => {
      const instance = new JsonKeySet();

      const a = keyA();
      const b = keyB();

      instance.add(a);
      instance.add(b);

      const keys = Array.from(instance.keys());

      expect(keys[0]).not.toBe(a);
      expect(keys[1]).not.toBe(b);
      expect(keys).toEqual([a, b]);
    });
  });

  describe('forEach', () => {
    it('should pass value equality keys to callback', () => {
      const instance = new JsonKeySet();

      const a = keyA();
      const b = keyB();

      instance.add(a);
      instance.add(b);

      const callbackFn = vi.fn();

      instance.forEach(callbackFn);

      expect(callbackFn).toHaveBeenCalledTimes(2);
      expect(callbackFn).toHaveBeenCalledWith(a, a, instance);
      expect(callbackFn).toHaveBeenCalledWith(b, b, instance);
    });
  });

  describe('values', () => {
    it('should provide value equality values', () => {
      const instance = new JsonKeySet();

      const a = keyA();
      const b = keyB();

      instance.add(a);
      instance.add(b);

      const values = Array.from(instance.values());

      expect(values[0]).not.toBe(a);
      expect(values[1]).not.toBe(b);

      expect(values).toEqual([a, b]);
    });
  });
});
