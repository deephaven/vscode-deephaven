import { hasProperty } from './dataUtils';

/**
 * Sanitize an auth header value.
 * @param authHeaderValue Sanitize secret portion of known auth headers. If
 * unrecognized, replace the whole thing.
 * @returns The sanitized auth header value.
 */
export function sanitizeAuthHeaderValue(authHeaderValue: string): string {
  if (
    authHeaderValue.startsWith('io.deephaven.proto.auth.Token') ||
    authHeaderValue.startsWith('Bearer')
  ) {
    return authHeaderValue.replace(/ \S+$/, ' ********');
  }

  return '********';
}

/**
 * Sanitize an auth header.
 * @param authorization The authorization header value. This can be a string
 * or an array of strings. Any other data types will be treated as an empty
 * string.
 * @returns The sanitized auth header value.
 */
export function sanitizeAuthHeader(authorization: unknown): string | string[] {
  if (typeof authorization === 'string') {
    return sanitizeAuthHeaderValue(authorization);
  }

  if (Array.isArray(authorization)) {
    return authorization.map(sanitizeAuthHeaderValue);
  }

  return sanitizeAuthHeaderValue('');
}

/**
 * Sanitize auth headers in a gRPC log message.
 * @param args The arguments to sanitize.
 * @returns The sanitized arguments.
 */
export function sanitizeGRPCLogMessageArgs([
  arg0,
  arg1,
  ...args
]: unknown[]): unknown[] {
  if (arg0 === 'start' && hasProperty(arg1, 'authorization')) {
    return [
      arg0,
      {
        ...arg1,
        authorization: sanitizeAuthHeader(arg1.authorization),
      },
    ];
  }

  return [arg0, arg1, ...args];
}
