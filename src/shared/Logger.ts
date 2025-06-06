/**
 * Simple logger class that logs messages to the console with a label.
 */
export class Logger {
  constructor(private readonly label: string) {
    /* eslint-disable no-console */
    this.info = console.info.bind(`[${label}]`);
    this.log = console.log.bind(`[${label}]`);
    this.warn = console.warn.bind(`[${label}]`);
    this.error = console.error.bind(`[${label}]`);
    /* eslint-enable no-console */
  }

  readonly info: (...args: unknown[]) => void;
  readonly log: (...args: unknown[]) => void;
  readonly warn: (...args: unknown[]) => void;
  readonly error: (...args: unknown[]) => void;
}
