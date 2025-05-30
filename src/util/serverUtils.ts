import type {
  ServerState,
  ServerType,
  ConsoleType,
  Port,
  ServerConnectionConfig,
  ConnectionState,
} from '../types';
import { SERVER_LANGUAGE_SET } from '../common';

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
 * Get the server URL from a ServerState or ConnectionState object.
 * @param serverOrConnectionState ServerState or ConnectionState object
 * @returns URL of the server
 */
export function getServerUrlFromState(
  serverOrConnectionState: ServerState | ConnectionState
): URL {
  return 'serverUrl' in serverOrConnectionState
    ? serverOrConnectionState.serverUrl
    : serverOrConnectionState.url;
}

/**
 * Check if the given object is a ConnectionState.
 * @param maybeConnectionState Object to check
 * @returns True if the object is a ConnectionState, false otherwise
 */
export function isConnectionState(
  maybeConnectionState: ServerState | ConnectionState
): maybeConnectionState is ConnectionState {
  return 'serverUrl' in maybeConnectionState;
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
