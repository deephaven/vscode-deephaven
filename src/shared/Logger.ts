/**
 * Simple logger class that logs messages to the console with a label.
 */
export class Logger {
  constructor(private readonly label: string) {
    /* eslint-disable no-console */
    this.info = console.info.bind(console, `[${this.label}]`);
    this.log = console.log.bind(console, `[${this.label}]`);
    this.warn = console.warn.bind(console, `[${this.label}]`);
    this.error = console.error.bind(console, `[${this.label}]`);
    /* eslint-enable no-console */
  }

  readonly info: (...args: unknown[]) => void;
  readonly log: (...args: unknown[]) => void;
  readonly warn: (...args: unknown[]) => void;
  readonly error: (...args: unknown[]) => void;
}
