import type {
  ConnectionState,
  ConsoleType,
  ServerConnectionPanelNode,
} from '../types';
import { isInstanceOf } from '../util';
import DhcService from './DhcService';

/**
 * Get connections supporting the given console type.
 * @param connections Connections to filter
 * @param consoleType Console type to filter by
 * @returns Connections supporting the given console type
 */
export async function getConnectionsForConsoleType(
  connections: ConnectionState[],
  consoleType: ConsoleType
): Promise<ConnectionState[]> {
  const filteredConnections: ConnectionState[] = [];

  for await (const connection of iterateConnectionsForConsoleType(
    connections,
    consoleType
  )) {
    filteredConnections.push(connection);
  }

  return filteredConnections;
}

export async function getFirstSupportedConsoleType(
  connectionOrVariable: ServerConnectionPanelNode
): Promise<ConsoleType | undefined> {
  const [consoleType] =
    isInstanceOf(connectionOrVariable, DhcService) &&
    connectionOrVariable.isInitialized
      ? await connectionOrVariable.getConsoleTypes()
      : [];

  return consoleType;
}

/**
 * Get the first connection supporting the given console type.
 * @param connections Connections to filter
 * @param consoleType Console type to filter by
 * @returns First connection supporting the given console type
 */
export async function getFirstConnectionForConsoleType(
  connections: ConnectionState[],
  consoleType: ConsoleType
): Promise<ConnectionState | null> {
  const first = await iterateConnectionsForConsoleType(
    connections,
    consoleType
  ).next();

  return first.value ?? null;
}

/**
 * Lazy async iterator that yields all connections supporting the given console
 * type.
 * @param connections Connections to iterate
 * @param consoleType Console type to filter by
 * @returns Async iterator for connections supporting the given console type
 */
export async function* iterateConnectionsForConsoleType(
  connections: ConnectionState[],
  consoleType: ConsoleType
): AsyncGenerator<ConnectionState, void, unknown> {
  for (const connection of connections) {
    const isConsoleTypeSupported =
      isInstanceOf(connection, DhcService) &&
      (await connection.supportsConsoleType(consoleType));

    if (isConsoleTypeSupported) {
      yield connection;
    }
  }
}
