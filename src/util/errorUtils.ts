import { Logger } from './Logger';

const logger = new Logger('errorUtils');

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
 * @param error
 */
export function parseServerError(error: string): ParsedError {
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
