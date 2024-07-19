import { describe, expect, it } from 'vitest';
import { ExtendedMap } from './ExtendedMap';

describe('ExtendedMap Test Suite', () => {
  it('should fail', () => {
    expect(4).toBe(5);
  });

  it('getOrThrow', () => {
    const map = new ExtendedMap<string, number>();

    map.set('a', 1);
    map.set('b', 2);

    expect(map.getOrThrow('a')).toBe(1);
    expect(map.getOrThrow('b')).toBe(2);

    expect(() => map.getOrThrow('c')).toThrowError(
      new Error("Key not found: 'c'")
    );
  });
});
