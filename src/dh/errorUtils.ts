export class NoConsoleTypesError extends Error {
  constructor() {
    super('No console types available');
  }
}

export interface ParsedError {
  [key: string]: string | number | undefined;
  type?: string;
  value?: string;
  line?: number;
  namespace?: string;
  file?: string;
  traceback?: string;
}

/**
 * Returns true if the given error is an AggregateError. Optionally checks if
 * a given code matches the error's code.
 * @param err Error to check
 * @param code Optional code to check
 */
export function isAggregateError(
  err: unknown,
  code?: string
): err is { code: string } {
  return hasErrorCode(err, code) && String(err) === 'AggregateError';
}

/**
 * Return true if given error has a code:string prop. Optionally check if the
 * code matches a given value.
 * @param err Error to check
 * @param code Optional code to check
 */
export function hasErrorCode(
  err: unknown,
  code?: string
): err is { code: string } {
  if (
    err != null &&
    typeof err === 'object' &&
    'code' in err &&
    typeof err.code === 'string'
  ) {
    return code == null || err.code === code;
  }

  return false;
}

/**
 * Parse a server error string into a key-value object.
 * @param error
 */
export function parseServerError(
  error: string,
  logger: { debug: (...args: unknown[]) => void } = console
): ParsedError {
  const errorDetails: ParsedError = {};
  const lines = error.split('\n');

  if (lines[0] !== 'java.lang.RuntimeException: Error in Python interpreter:') {
    logger.debug('Unrecognized error type:', error);
    return errorDetails;
  }

  while (lines.length) {
    const line = lines.shift()!;

    const [key, value] = line.split(':');

    if (key.length) {
      // Once we hit the Traceback, accumulate remaining lines
      if (key === 'Traceback (most recent call last)') {
        errorDetails.traceback = [value, ...lines].join('\n');
        break;
      }

      errorDetails[key.toLowerCase()] =
        key === 'Line' ? Number(value.trim()) : value.trim();
    }
  }

  // If top-level error isn't associated with File: "<string>", look for the
  // first match in the traceback.
  if (errorDetails.file !== '<string>' && errorDetails.traceback != null) {
    const fileStringRegEx = /\s+File "<string>", line (\d+), in <module>/;
    const [, lineNumberStr] =
      fileStringRegEx.exec(errorDetails.traceback) ?? [];

    if (lineNumberStr != null) {
      errorDetails.line = Number(lineNumberStr);
    }
  }

  return errorDetails;
}
