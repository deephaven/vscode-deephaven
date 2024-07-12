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
  static addConsoleHandler = () => {
    Logger.handlers.add({
      /* eslint-disable no-console */
      error: (label, ...args) => console.error(`[${label}] ERROR:`, ...args),
      warn: (label, ...args) => console.warn(`[${label}] WARN:`, ...args),
      info: (label, ...args) => console.info(`[${label}] INFO:`, ...args),
      debug: (label, ...args) => console.debug(`[${label}] DEBUG:`, ...args),
      debug2: (label, ...args) => console.debug(`[${label}] DEBUG2:`, ...args),
      /* eslint-enable no-console */
    });
  };

  /**
   * Register a log handler that logs to a `vscode.OutputChannel`.
   * @param outputChannel
   */
  static addOutputChannelHandler = (outputChannel: vscode.OutputChannel) => {
    Logger.handlers.add({
      error: (label, ...args) =>
        outputChannel.appendLine(`[${label}] ERROR: ${args.join(', ')}`),
      warn: (label, ...args) =>
        outputChannel.appendLine(`[${label}] WARN: ${args.join(', ')}`),
      info: (label, ...args) =>
        outputChannel.appendLine(`[${label}] INFO: ${args.join(', ')}`),
      debug: (label, ...args) =>
        outputChannel.appendLine(`[${label}] DEBUG: ${args.join(', ')}`),
      debug2: (label, ...args) =>
        outputChannel.appendLine(`[${label}] DEBUG2: ${args.join(', ')}`),
    });
  };

  constructor(private label: string) {}

  /**
   * Handle log args for a given level
   * @param level The level to handle
   * @param args The arguments to log
   */
  private handle = (level: LogLevel, ...args: unknown[]) => {
    Logger.handlers.forEach(handler => handler[level](this.label, ...args));
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
