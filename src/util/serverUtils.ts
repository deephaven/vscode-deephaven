import * as path from 'node:path';
import type {
  ServerState,
  ServerType,
  ConsoleType,
  Port,
  ServerConnectionConfig,
} from '../types';
import { PIP_SERVER_STATUS_DIRECTORY, SERVER_LANGUAGE_SET } from '../common';
import { getTempDir } from './tmpUtils';

/**
 * Get initial server states based on server configs.
 * @param type Server type
 * @param configs Server connection configs
 * @returns Initial server states
 */
export function getInitialServerStates(
  type: ServerType,
  configs: ServerConnectionConfig[]
): ServerState[] {
  return configs.map(config => ({
    type,
    label: config instanceof URL ? undefined : config.label,
    url: config instanceof URL ? config : config.url,
    isConnected: false,
    isRunning: false,
    connectionCount: 0,
  }));
}

/**
 * If the given value is a valid console type, return it, otherwise return undefined.
 * @param maybeConsoleType
 * @returns A console type or undefined if given value is invalid.
 */
export function getConsoleType(
  maybeConsoleType?: string
): ConsoleType | undefined {
  return typeof maybeConsoleType === 'string' &&
    SERVER_LANGUAGE_SET.has(maybeConsoleType as ConsoleType)
    ? (maybeConsoleType as ConsoleType)
    : undefined;
}

/**
 * Get the pip server URL for the given port.
 * @param port The port number to create a URL for
 * @returns The pip server URL
 */
export function getPipServerUrl(port: Port): URL {
  return new URL(`http://localhost:${port}`);
}

/**
 * Get the path to the pip server status file.
 * @returns The path to the pip server status file
 */
export function getPipStatusFilePath(): string {
  const dirPath = getTempDir({
    subDirectory: PIP_SERVER_STATUS_DIRECTORY,
  });
  const statusFileName = `status-pip.txt`;
  return path.join(dirPath, statusFileName);
}

/**
 * Determine if the given languageId is supported by DH servers.
 * @param maybeSupported
 * @returns Whether the languageId is supported
 */
export function isSupportedLanguageId(
  maybeSupported?: string | null
): maybeSupported is ConsoleType {
  return SERVER_LANGUAGE_SET.has(maybeSupported as ConsoleType);
}

/**
 * Parse a port string into a number.
 * @param portStr Numeric port string to parse
 * @returns Parsed port number
 */
export function parsePort(portStr: string): Port {
  const parsed = Number(portStr);
  if (isNaN(parsed)) {
    throw new Error(`Invalid port: ${portStr}`);
  }

  return parsed as Port;
}
