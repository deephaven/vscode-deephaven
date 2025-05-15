import { describe, it, expect } from 'vitest';
import { assertDefined } from './assertUtil';

// Example function tests
describe('assertDefined', () => {
  it.each([{}, 'test', 999, true, false, new Date()])(
    'should not throw if value is defined: %s',
    value => {
      assertDefined(value, 'value');
      expect(true).toBe(true);
    }
  );

  it.each([null, undefined])(
    'should throw an error for null or undefined values: %s',
    value => {
      expect(() => assertDefined(value, 'value')).toThrow(
        `'value' is required`
      );
    }
  );
});
