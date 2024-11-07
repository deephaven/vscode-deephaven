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
  type: Function & { prototype: T }
): value is T {
  return value instanceof type;
}
