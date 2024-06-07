/**
 * Typeguard for checking if an object has a property `code` with a specific
 * value.
 * @param maybeHasErrorCode
 * @param value
 */
export function hasErrorCode<TValue>(
  maybeHasErrorCode: any,
  value: TValue
): maybeHasErrorCode is { code: TValue } {
  return 'code' in maybeHasErrorCode && maybeHasErrorCode.code === value;
}
