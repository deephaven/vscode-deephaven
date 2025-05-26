/**
 * Code in this module needs to be consumable from both the extension code (CJS)
 * and the webview content code (ESM). Avoid importing anything here from outside
 * of the `shared` folder to minimize the risk of breaking the builds.
 */

/**
 * Assert that a given value is not `null` or `undefined`.
 * @param dependency The value to assert.
 * @param name The name of the value to include in the error message if the assertion fails.
 */
export function assertDefined<T>(
  dependency: T | null | undefined,
  name: string
): asserts dependency is T {
  if (dependency == null) {
    throw new Error(`'${name}' is required`);
  }
}

/**
 * Assertion for a value that should never be reached. Useful for exhaustive switch
 * checks.
 * @param shouldBeNever The value that should never be reached.
 * @param name The name of the value to include in the error message if the assertion fails.
 */
export function assertNever(shouldBeNever: never, name?: string): never {
  const label = name == null ? 'value' : `'${name}'`;
  throw new Error(`Unexpected ${label}: ${shouldBeNever}`);
}
