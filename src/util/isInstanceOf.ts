/**
 * Type guard wrapper of `instanceof` operator. This is not actually necessary
 * as a typeguard, since `instanceof` is already a typeguard, but it allows us
 * to mock `instanceof` checks in unit tests.
 * @param value The value to check
 * @param type The type to check against
 * @returns `true` if `value` is an instance of `type`
 */
export function isInstanceOf<T>(
  value: unknown,
  // Possible we'll need to include non-abstract constructor type, but this seems
  // to work for both abstract and non-abstract constructors.
  type: abstract new (...args: any[]) => T
): value is T {
  return value instanceof type;
}
