import * as assert from 'assert';

import { ExtendedMap } from '../../../util/ExtendedMap';

suite('ExtendedMap Test Suite', () => {
  test('getOrThrow', () => {
    const map = new ExtendedMap<string, number>();

    map.set('a', 1);
    map.set('b', 2);

    assert.strictEqual(map.getOrThrow('a'), 1);
    assert.strictEqual(map.getOrThrow('b'), 2);

    assert.throws(() => {
      map.getOrThrow('c');
    }, new Error("Key not found: 'c'"));
  });
});
