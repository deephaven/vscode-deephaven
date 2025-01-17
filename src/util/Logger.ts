import * as vscode from 'vscode';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'debug2';

export type LogLevelHandler = (label: string, ...args: unknown[]) => void;

export type LogHandler = Record<LogLevel, LogLevelHandler>;

/**
 * Simple logger delegate that can be used to log messages to a set of handlers.
 * Messages will include a label for scoping log messages.
 *
 * Handlers can be statically registered via:
 *
 *   Logger.handlers.add(handler);
 *
 * Then modules can create labeled loggers and use them to log messages:
 *
 *   const logger = new Logger('MyModule');
 *   logger.info('Hello, world!');
 */
export class Logger {
  static handlers: Set<LogHandler> = new Set();

  /**
   * Register log handler that logs to console.
   */
  static addConsoleHandler = (): void => {
    const createHandler =
      (level: Exclude<LogLevel, 'debug2'>): LogLevelHandler =>
      (...args) =>
        /* eslint-disable no-console */
        console[level]('[vscode-deephaven]', ...args);

    Logger.handlers.add({
      error: createHandler('error'),
      warn: createHandler('warn'),
      info: createHandler('info'),
      debug: createHandler('debug'),
      debug2: createHandler('debug'),
      /* eslint-enable no-console */
    });
  };

  /**
   * Register a log handler that logs to a `vscode.OutputChannel`.
   * @param outputChannel
   */
  static addOutputChannelHandler = (
    outputChannel: vscode.OutputChannel
  ): void => {
    const createHandler =
      (level: LogLevel): LogLevelHandler =>
      (label, ...args) =>
        outputChannel.appendLine(
          `${label} ${level.toUpperCase()}: ${args.map(a => (a instanceof Error ? (a.stack ?? a.message) : a)).join(' ')}`
        );

    Logger.handlers.add({
      error: createHandler('error'),
      warn: createHandler('warn'),
      info: createHandler('info'),
      debug: createHandler('debug'),
      debug2: createHandler('debug2'),
    });
  };

  constructor(private readonly label: string) {}

  /**
   * Handle log args for a given level
   * @param level The level to handle
   * @param args The arguments to log
   */
  private handle = (level: LogLevel, ...args: unknown[]): void => {
    Logger.handlers.forEach(handler =>
      handler[level](`[${this.label}]`, ...args)
    );
  };

  debug = (...args: unknown[]): void => {
    this.handle('debug', ...args);
  };

  debug2 = (...args: unknown[]): void => {
    this.handle('debug2', ...args);
  };

  info = (...args: unknown[]): void => {
    this.handle('info', ...args);
  };

  warn = (...args: unknown[]): void => {
    this.handle('warn', ...args);
  };

  error = (...args: unknown[]): void => {
    this.handle('error', ...args);
  };
}
