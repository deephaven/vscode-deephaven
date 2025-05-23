/**
 * Code in this module needs to be consumable from both the extension code (CJS)
 * and the webview content code (ESM). Avoid importing anything here from outside
 * of the `crossModule` folder to minimize the risk of breaking the builds.
 */

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
