import * as vscode from 'vscode';
import type {
  IDhService,
  ServerGroupState,
  ServerState,
  VariableDefintion,
} from '../types';
import {
  ICON_ID,
  OPEN_VARIABLE_PANELS_CMD,
  SERVER_TREE_ITEM_CONTEXT,
  VARIABLE_ICONS,
  type ServerTreeItemContextValue,
} from '../common';

/**
 * Get `TreeItem` for a panel connection.
 * @param connection
 */
export function getPanelConnectionTreeItem(
  connection: IDhService
): vscode.TreeItem {
  return {
    label: new URL(connection.serverUrl.toString()).host,
    // description: consoleType,
    // contextValue: CONNECTION_TREE_ITEM_CONTEXT.isConnection,
    // collapsibleState: hasUris
    //   ? vscode.TreeItemCollapsibleState.Expanded
    //   : undefined,
    collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
    iconPath: new vscode.ThemeIcon(
      connection.isConnected ? ICON_ID.connected : ICON_ID.connecting
    ),
  };
}

/**
 * Get `TreeItem` for a panel variable.
 * @param variable
 */
export function getPanelVariableTreeItem([url, variable]: [
  URL,
  VariableDefintion,
]): vscode.TreeItem {
  const iconId = VARIABLE_ICONS[variable.type];

  return {
    description: variable.title,
    iconPath: iconId == null ? undefined : new vscode.ThemeIcon(iconId),
    command: {
      title: 'Open Panel',
      command: OPEN_VARIABLE_PANELS_CMD,
      arguments: [url, [variable]],
    },
  };
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
 * @param connectionCount Number of connections
 * @param isManaged Whether the server is managed
 * @param label Server label
 * @returns Description text
 */
export function getServerDescription(
  connectionCount: number,
  isManaged: boolean,
  label: string = ''
): string | undefined {
  if (isManaged) {
    label = label === '' ? 'pip' : `pip ${label}`;
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
 * @returns `contextValue` for the server group tree item
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
 * @returns Tree item for the server group
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
 * Get icon id for a server in the UI. e.g. for tree nodes.
 * @param isConnected Whether the server is connected
 * @param isManaged Whether the server is managed
 * @param isRunning Whether the server is running
 * @returns Icon id for server tree item
 */
export function getServerIconID({
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
 * @returns Tree item representing the server
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
}): vscode.TreeItem {
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
      getServerIconID({ isConnected, isManaged, isRunning })
    ),
    command: canConnect
      ? {
          title: 'Connect to server',
          command: 'vscode-deephaven.connectToServer',
          arguments: [server],
        }
      : undefined,
  };
}

/**
 * Group server states.
 * @param servers Server states
 * @returns Grouped server states
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