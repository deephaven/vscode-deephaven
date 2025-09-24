import { describe, it, expect, vi } from 'vitest';
import { SerializedKeyMap } from './SerializedKeyMap';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

describe('SerializedKeyMap', () => {
  const deserializeKey = (key: string): Object => JSON.parse(key);
  const serializeKey = (key: Object): string => JSON.stringify(key);

  class JsonKeyMap extends SerializedKeyMap<Object, string> {
    deserializeKey = deserializeKey;
    serializeKey = serializeKey;
  }

  const keyA = () => ({ a: 1 }) as const;
  const keyB = () => ({ b: 2 }) as const;

  it('should key data by value equality', () => {
    const instance = new JsonKeyMap();

    expect(instance.has(keyA())).toBe(false);

    instance.set(keyA(), 'value-a');

    expect(instance.has(keyA())).toBe(true);
    expect(instance.get(keyA())).toBe('value-a');

    instance.delete(keyA());
    expect(instance.has(keyA())).toBe(false);
  });

  describe('entries', () => {
    it('should provide value equality entries', () => {
      const instance = new JsonKeyMap();

      const a = keyA();
      const b = keyB();

      instance.set(a, 'value-a');
      instance.set(b, 'value-b');

      const entries = [...instance.entries()];

      expect(entries[0][0]).not.toBe(a);
      expect(entries[1][0]).not.toBe(b);
      expect(entries).toEqual([
        [a, 'value-a'],
        [b, 'value-b'],
      ]);
    });
  });

  describe('keys', () => {
    it('should provide value equality keys', () => {
      const instance = new JsonKeyMap();

      const a = keyA();
      const b = keyB();

      instance.set(a, 'value-a');
      instance.set(b, 'value-b');

      const keys = [...instance.keys()];
      expect(keys[0]).not.toBe(a);
      expect(keys[1]).not.toBe(b);
      expect(keys).toEqual([a, b]);
    });
  });

  describe('forEach', () => {
    it.each([undefined, {}])(
      'should pass value equality keys to callback: %o',
      thisArg => {
        const instance = new JsonKeyMap();

        instance.set(keyA(), 'value-a');
        instance.set(keyB(), 'value-b');

        const callbackFn = vi.fn();

        instance.forEach(callbackFn, thisArg);

        expect(callbackFn).toHaveBeenCalledTimes(2);

        expect(callbackFn).toHaveBeenCalledWith('value-a', keyA(), thisArg);
        expect(callbackFn).toHaveBeenCalledWith('value-b', keyB(), thisArg);
      }
    );
  });

  describe('values', () => {
    it('should provide values', () => {
      const instance = new JsonKeyMap();

      instance.set(keyA(), 'value-a');
      instance.set(keyB(), 'value-b');

      const values = [...instance.values()];

      expect(values).toEqual(['value-a', 'value-b']);
    });
  });
});
