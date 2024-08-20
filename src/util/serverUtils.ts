import type {
  IDhService,
  ServerState,
  ServerType,
  ConsoleType,
} from '../types';
import { SERVER_LANGUAGE_SET } from '../common';

/**
 * Get initial server states based on server configs.
 * @param type
 * @param configs
 */
export function getInitialServerStates(
  type: ServerType,
  configs: { url: URL }[]
): ServerState[] {
  return configs.map(({ url }) => ({
    type,
    url,
  }));
}

/**
 * Get connections supporting the given console type.
 * @param connections
 * @param consoleType
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
 * @param connections
 * @param consoleType
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
 * Determine if the given languageId is supported by DH servers.
 * @param maybeSupported
 * @returns
 */
export function isSupportedLanguageId(
  maybeSupported: string
): maybeSupported is ConsoleType {
  return SERVER_LANGUAGE_SET.has(maybeSupported as ConsoleType);
}

/**
 * Lazy async iterator that yields all connections supporting the given console
 * type.
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
