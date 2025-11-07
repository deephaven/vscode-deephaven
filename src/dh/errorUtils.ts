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
 * Parse a server error string into a tuple of `ParsedError` objects.
 * @param error Error string to parse.
 * @param logger Optional logger for debugging. Defaults to console.
 * @returns Array of parsed error objects. This can be one of:
 * - []: Unrecognized error format.
 * - [ParsedError]: Error originated from the file being executed.
 * - [ParsedError, ParsedError]: Error originated from another file, but we
 *   were able to extract a `File: <string>` line from the traceback. First
 *   object is the originating error, second object is an adjusted version that
 *   points to the line in the executed file.
 */
export function parseServerError(
  error: string,
  logger: { debug: (...args: unknown[]) => void } = console
): [] | [ParsedError] | [ParsedError, ParsedError] {
  const lines = error.split('\n');

  if (lines[0] !== 'java.lang.RuntimeException: Error in Python interpreter:') {
    logger.debug('Unrecognized error type:', error);
    return [];
  }

  const topLevelError: ParsedError = {};

  while (lines.length) {
    const line = lines.shift()!;

    const [key, value] = line.split(':');

    if (key.length) {
      // Once we hit the Traceback, accumulate remaining lines
      if (key === 'Traceback (most recent call last)') {
        topLevelError.traceback = [value, ...lines].join('\n');
        break;
      }

      topLevelError[key.toLowerCase()] =
        key === 'Line' ? Number(value.trim()) : value.trim();
    }
  }

  // If the top-level error contains File: "<string>", we assume the error
  // originated from the file being executed. The line number should already be
  // accurate, so we can just return it as-is.
  if (topLevelError.file === '<string>') {
    return [topLevelError];
  }

  // If the error originates from a file other than the one being executed, File:
  // should be set to an actual file path. In such cases, we keep the error in
  // case the file is in the workspace. We also search the traceback for the
  // first occurrence of File: "<string>" which should correspond to the file
  // being executed. If we find it, we copy the top-level error but adjust the
  // line number and set file to "<string>" so that we can include it in
  // diagnostics further upstream.
  if (topLevelError.traceback != null) {
    const fileStringRegEx = /\s+File "<string>", line (\d+), in <module>/;
    const [, lineNumberStr] =
      fileStringRegEx.exec(topLevelError.traceback) ?? [];

    if (lineNumberStr != null) {
      return [
        topLevelError,
        {
          ...topLevelError,
          file: '<string>',
          line: Number(lineNumberStr),
        },
      ];
    }
  }

  return [topLevelError];
}
