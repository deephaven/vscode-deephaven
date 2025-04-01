import * as vscode from 'vscode';
import fs from 'node:fs';
import path from 'node:path';
import type { IDisposable, UniqueID } from '../types';
import { getFilePathDateToken } from './dataUtils';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'debug2';

export type LogLevelHandler = (label: string, ...args: unknown[]) => void;

export type LogHandler = Record<LogLevel, LogLevelHandler>;

/**
 * Log handler that writes logs to a file.
 */
export class LogFileHandler implements LogHandler, IDisposable {
  constructor(extensionInstanceId: UniqueID, context: vscode.ExtensionContext) {
    // VS Code specifies the log directory but doesn't create it
    fs.mkdirSync(context.logUri.fsPath, { recursive: true });

    this._extensionInstanceId = extensionInstanceId;
    this.logDirectory = context.logUri.fsPath;
  }

  private readonly _extensionInstanceId: UniqueID;
  private _lastLogBucket: string | null = null;
  private _logWriter: fs.WriteStream | null = null;

  readonly logDirectory: string;

  private _getLogFilePath = (isoDateStr: string): string => {
    const dateToken = getFilePathDateToken(isoDateStr);

    const logFileName = `deephaven-vscode_${dateToken}_${this._extensionInstanceId}.log`;
    return path.join(this.logDirectory, logFileName);
  };

  private _write = (
    level: LogLevel,
    label: string,
    ...args: unknown[]
  ): void => {
    const now = new Date().toISOString();
    const hourBucket = now.substring(0, 13);

    // Initialize log writer or update it if the hour bucket has changed
    if (this._logWriter == null || this._lastLogBucket !== hourBucket) {
      this._logWriter?.end();
      this._lastLogBucket = hourBucket;

      const logFilePath = this._getLogFilePath(now);
      this._logWriter = fs.createWriteStream(logFilePath);
    }

    this._logWriter.write(
      `[${now}] ${label} ${level.toUpperCase()}: ${args.map(Logger.stringifyArg).join(' ')}\n`
    );
  };

  error = this._write.bind(this, 'error');
  warn = this._write.bind(this, 'warn');
  info = this._write.bind(this, 'info');
  debug = this._write.bind(this, 'debug');
  debug2 = this._write.bind(this, 'debug2');

  dispose = async (): Promise<void> => {
    this._logWriter?.end();
    this._logWriter = null;
  };
}

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
    const createHandler = (
      level: Exclude<LogLevel, 'debug2'>
      /* eslint-disable no-console */
    ): LogLevelHandler => console[level].bind(console, '[vscode-deephaven]');

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
   * Stringify an argument for logging.
   * @param arg The argument to stringify.
   * @returns The stringified argument.
   */
  static stringifyArg = (arg: unknown): string => {
    if (arg instanceof Error) {
      return arg.stack ?? arg.message;
    }

    if (typeof arg === 'string') {
      return arg;
    }

    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  };

  /**
   * Create a log handler that logs to a `vscode.OutputChannel`.
   * @param outputChannel The output channel to log to.
   * @returns A log handler that logs to the output channel.
   */
  static createOutputChannelHandler = (
    outputChannel: vscode.OutputChannel
  ): ((level: LogLevel) => LogLevelHandler) => {
    return (level: LogLevel): LogLevelHandler =>
      (label, ...args) =>
        outputChannel.appendLine(
          `${label} ${level.toUpperCase()}: ${args.map(Logger.stringifyArg).join(' ')}`
        );
  };

  /**
   * Register a log handler that logs to a `vscode.OutputChannel`.
   * @param outputChannel
   */
  static addOutputChannelHandler = (
    outputChannel: vscode.OutputChannel
  ): void => {
    const createHandler = Logger.createOutputChannelHandler(outputChannel);

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
