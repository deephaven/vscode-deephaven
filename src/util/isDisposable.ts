import type { IDisposable } from '../types';

/**
 * Typeguard to determine if given object has a `disposable` method.
 * @param maybeDisposable The object to check.
 * @returns `true` if the object has a `dispose` method, `false` otherwise.
 */
export function isDisposable(
  maybeDisposable: unknown
): maybeDisposable is IDisposable {
  return (
    maybeDisposable != null &&
    typeof maybeDisposable === 'object' &&
    'dispose' in maybeDisposable &&
    typeof maybeDisposable.dispose === 'function'
  );
}
