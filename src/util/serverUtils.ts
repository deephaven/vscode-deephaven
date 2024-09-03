import * as vscode from 'vscode';
import type {
  IDhService,
  ServerState,
  ServerType,
  ConsoleType,
  EnterpriseConnectionConfig,
  CoreConnectionConfig,
  Port,
  ServerGroupState,
} from '../types';
import {
  ICON_ID,
  SERVER_LANGUAGE_SET,
  SERVER_TREE_ITEM_CONTEXT,
  type ServerTreeItemContextValue,
} from '../common';

/**
 * Get initial server states based on server configs.
 * @param type
 * @param configs
 */
export function getInitialServerStates(
  type: ServerType,
  configs: (CoreConnectionConfig | EnterpriseConnectionConfig | URL)[]
): ServerState[] {
  return configs.map(config => ({
    type,
    label: config instanceof URL ? undefined : config.label,
    url: config instanceof URL ? config : config.url,
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
 * Get the pip server URL for the given port.
 * @param port
 */
export function getPipServerUrl(port: Port): URL {
  return new URL(`http://localhost:${port}`);
}

/**
 * Get `contextValue` for server tree items.
 * @param isConnected Whether the server is connected
 * @param isManaged Whether the server is managed
 * @param isRunning Whether the server is running
 */
export function getServerContextValue({
  isConnected,
  isManaged,
  isRunning,
}: {
  isConnected: boolean;
  isManaged: boolean;
  isRunning: boolean;
}): ServerTreeItemContextValue {
  if (isManaged) {
    return isConnected
      ? SERVER_TREE_ITEM_CONTEXT.isManagedServerConnected
      : isRunning
        ? SERVER_TREE_ITEM_CONTEXT.isManagedServerDisconnected
        : SERVER_TREE_ITEM_CONTEXT.isManagedServerConnecting;
  }

  if (isRunning) {
    return isConnected
      ? SERVER_TREE_ITEM_CONTEXT.isServerRunningConnected
      : SERVER_TREE_ITEM_CONTEXT.isServerRunningDisconnected;
  }

  return SERVER_TREE_ITEM_CONTEXT.isServerStopped;
}

/**
 * Get description text for a server in the UI. e.g. for tree nodes.
 * @param connectionCount
 * @param label
 */
export function getServerDescription(
  connectionCount: number,
  isManaged: boolean,
  label: string = ''
): string | undefined {
  if (isManaged) {
    label = `pip ${label}`;
  }

  if (connectionCount === 0) {
    return label;
  }

  if (label === '') {
    return `(${connectionCount})`;
  }

  return `${label} (${connectionCount})`;
}

/**
 * Get `contextValue` for a server group tree item.
 * @param group Server group state
 * @param canStartServer Whether servers can be started
 */
export function getServerGroupContextValue(
  group: ServerGroupState,
  canStartServer: boolean
): typeof SERVER_TREE_ITEM_CONTEXT.canStartServer | undefined {
  if (group === 'Managed' && canStartServer) {
    return SERVER_TREE_ITEM_CONTEXT.canStartServer;
  }

  return undefined;
}

/**
 * Get tree item for a server group.
 * @param group Server group state
 * @param canStartServer Whether servers can be started
 */
export function getServerGroupTreeItem(
  group: ServerGroupState,
  canStartServer: boolean
): vscode.TreeItem {
  return {
    label: group,
    iconPath: new vscode.ThemeIcon(ICON_ID.server),
    collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
    contextValue: getServerGroupContextValue(group, canStartServer),
  };
}

/**
 * Get icon path for a server in the UI. e.g. for tree nodes.
 * @param isConnected
 * @param isManaged
 * @param isRunning
 */
export function getServerIconPath({
  isConnected,
  isManaged,
  isRunning,
}: {
  isConnected: boolean;
  isManaged: boolean;
  isRunning: boolean;
}): string {
  return isRunning
    ? isConnected
      ? ICON_ID.serverConnected
      : ICON_ID.serverRunning
    : isManaged
      ? ICON_ID.connecting
      : ICON_ID.serverStopped;
}

/**
 * Get tree item for a server.
 * @param server Server state
 * @param isConnected Whether the server is connected
 * @param isManaged Whether the server is managed
 * @param isRunning Whether the server is running
 */
export function getServerTreeItem({
  server,
  isConnected,
  isManaged,
  isRunning,
}: {
  server: ServerState;
  isConnected: boolean;
  isManaged: boolean;
  isRunning: boolean;
}): vscode.TreeItem | Thenable<vscode.TreeItem> {
  const contextValue = getServerContextValue({
    isConnected,
    isManaged,
    isRunning,
  });

  const description = getServerDescription(
    isConnected ? 1 : 0,
    isManaged,
    server.label
  );

  const urlStr = server.url.toString();

  const canConnect =
    contextValue === SERVER_TREE_ITEM_CONTEXT.isManagedServerDisconnected ||
    contextValue === SERVER_TREE_ITEM_CONTEXT.isServerRunningDisconnected;

  return {
    label: new URL(urlStr).host,
    description,
    tooltip: canConnect ? `Click to connect to ${urlStr}` : urlStr,
    contextValue: server.type === 'DHC' ? contextValue : undefined,
    iconPath: new vscode.ThemeIcon(
      getServerIconPath({ isConnected, isManaged, isRunning })
    ),
    command: canConnect
      ? {
          title: 'Open in Browser',
          command: 'vscode-deephaven.connectToServer',
          arguments: [server],
        }
      : undefined,
  };
}

/**
 * Group server states.
 * @param servers Server states
 */
export function groupServers(servers: ServerState[]): {
  managed: ServerState[];
  running: ServerState[];
  stopped: ServerState[];
} {
  const managed = [];
  const running = [];
  const stopped = [];

  for (const server of servers) {
    if (server.isManaged) {
      managed.push(server);
    } else if (server.isRunning) {
      running.push(server);
    } else {
      stopped.push(server);
    }
  }

  return {
    managed,
    running,
    stopped,
  };
}

/**
 * Determine if the given languageId is supported by DH servers.
 * @param maybeSupported
 * @returns
 */
export function isSupportedLanguageId(
  maybeSupported?: string | null
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

/**
 * Parse a port string into a number.
 * @param portStr
 */
export function parsePort(portStr: string): Port {
  const parsed = Number(portStr);
  if (isNaN(parsed)) {
    throw new Error(`Invalid port: ${portStr}`);
  }

  return parsed as Port;
}
