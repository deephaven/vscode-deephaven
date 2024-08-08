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
