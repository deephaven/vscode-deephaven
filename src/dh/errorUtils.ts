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
 * Parse a server error string into a key-value object.
 * @param error Error string to parse.
 * @param logger Optional logger for debugging. Defaluts to console.
 */
export function parseServerError(
  error: string,
  logger: { debug: (...args: unknown[]) => void } = console
): ParsedError[] {
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
