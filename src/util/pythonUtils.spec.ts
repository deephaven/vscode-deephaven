import { describe, it, expect } from 'vitest';
import { extractControllerImportPrefixes } from './pythonUtils';

// Code generators for each pattern's call syntax
const makeCode = {
  pattern1: (args: string): string =>
    `deephaven_enterprise.controller_import.meta_import(${args})`,
  pattern2: (args: string): string =>
    `from deephaven_enterprise import controller_import\ncontroller_import.meta_import(${args})`,
  pattern3: (args: string): string =>
    `from deephaven_enterprise.controller_import import meta_import\nmeta_import(${args})`,
};

describe('extractControllerImportPrefixes', () => {
  // Shared behavior across all 3 patterns
  describe.each([
    ['pattern 1 (direct call)', makeCode.pattern1],
    ['pattern 2 (from module import)', makeCode.pattern2],
    ['pattern 3 (from function import)', makeCode.pattern3],
  ])('%s', (_, make: (args: string) => string) => {
    it.each([
      ['double-quoted prefix', '"my_prefix"', new Set(['my_prefix'])],
      ["single-quoted prefix", `'my_prefix'`, new Set(['my_prefix'])],
      ['no arg defaults to "controller"', '', new Set(['controller'])],
      ['whitespace inside parens', '  "spaced"  ', new Set(['spaced'])],
    ])('%s', (_label, args, expected) => {
      expect(extractControllerImportPrefixes(make(args))).toEqual(expected);
    });

    it('multiple calls yield multiple prefixes', () => {
      expect(
        extractControllerImportPrefixes(`${make('"a"')}\n${make('"b"')}`)
      ).toEqual(new Set(['a', 'b']));
    });
  });

  // Unique to patterns 2 & 3: call without import statement yields no match
  it.each([
    ['pattern 2', `controller_import.meta_import("foo")`],
    ['pattern 3', `meta_import("foo")`],
  ])('%s - call without import statement yields empty set', (_, code) => {
    expect(extractControllerImportPrefixes(code)).toEqual(new Set());
  });

  // Edge cases
  it.each([
    [
      'duplicate prefix across patterns is deduplicated',
      `from deephaven_enterprise.controller_import import meta_import\ndeephaven_enterprise.controller_import.meta_import("dup")\nmeta_import("dup")`,
      new Set(['dup']),
    ],
    ['no meta_import calls', 'x = 1', new Set()],
    ['empty string', '', new Set()],
  ])('%s', (_label, code, expected) => {
    expect(extractControllerImportPrefixes(code)).toEqual(expected);
  });
});
