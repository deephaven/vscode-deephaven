import * as path from 'node:path';
import type {
  IDhService,
  ServerState,
  ServerType,
  ConsoleType,
  Port,
  ServerConnectionConfig,
} from '../types';
import { PIP_SERVER_STATUS_DIRECTORY, SERVER_LANGUAGE_SET } from '../common';
import { getTempDir } from './downloadUtils';

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
  }));
}

/**
 * Get connections supporting the given console type.
 * @param connections Connections to filter
 * @param consoleType Console type to filter by
 * @returns Connections supporting the given console type
 */
export async function getConnectionsForConsoleType(
  connections: IDhService[],
  consoleType: ConsoleType
): Promise<IDhService[]> {
  const filteredConnections: IDhService[] = [];

  for await (const connection of iterateConnectionsForConsoleType(
    connections,
    consoleType
  )) {
    filteredConnections.push(connection);
  }

  return filteredConnections;
}

/**
 * Get the first connection supporting the given console type.
 * @param connections Connections to filter
 * @param consoleType Console type to filter by
 * @returns First connection supporting the given console type
 */
export async function getFirstConnectionForConsoleType(
  connections: IDhService[],
  consoleType: ConsoleType
): Promise<IDhService<unknown, unknown> | null> {
  const first = await iterateConnectionsForConsoleType(
    connections,
    consoleType
  ).next();

  return first.value ?? null;
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
  const dirPath = getTempDir(false, PIP_SERVER_STATUS_DIRECTORY);
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
 * Lazy async iterator that yields all connections supporting the given console
 * type.
 * @param connections Connections to iterate
 * @param consoleType Console type to filter by
 * @returns Async iterator for connections supporting the given console type
 */
export async function* iterateConnectionsForConsoleType(
  connections: IDhService[],
  consoleType: ConsoleType
): AsyncGenerator<IDhService, void, unknown> {
  for (const dhService of connections) {
    const isConsoleTypeSupported =
      await dhService.supportsConsoleType(consoleType);

    if (isConsoleTypeSupported) {
      yield dhService;
    }
  }
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

/**
 * Sort comparator for sorting by `serverUrl`.
 * @param a
 * @param b
 */
export function sortByServerUrl(
  a: { serverUrl: URL },
  b: { serverUrl: URL }
): number {
  return a.serverUrl.toString().localeCompare(b.serverUrl.toString());
}
