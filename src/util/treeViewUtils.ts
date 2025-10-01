import * as vscode from 'vscode';
import type {
  ConnectionState,
  ConsoleType,
  MarkStatus,
  NonEmptyArray,
  ServerGroupState,
  ServerState,
  VariableDefintion,
  VariableType,
} from '../types';
import {
  ICON_ID,
  OPEN_VARIABLE_PANELS_CMD,
  SERVER_TREE_ITEM_CONTEXT,
  type ServerTreeItemContextValue,
} from '../common';

/**
 * Get checkbox state for a markable workspace tree node.
 * @param markStatus
 * @returns checkbox state for the tree item
 */
export function getMarkableWsTreeCheckBoxState(
  markStatus: MarkStatus
): vscode.TreeItem['checkboxState'] {
  if (markStatus === 'marked') {
    return {
      state: vscode.TreeItemCheckboxState.Checked,
      tooltip: 'Remove from Deephaven remote file sources',
    };
  }

  return {
    state: vscode.TreeItemCheckboxState.Unchecked,
    tooltip: 'Add to Deephaven remote file sources',
  };
}

/**
 * Get a tree item vscode.ThemeIcon for a variable type.
 * @param variableType Variable type
 * @returns Theme icon for the variable type
 */
export function getVariableIconPath(
  variableType: VariableType
): vscode.ThemeIcon {
  // Based on @deephaven/console `ObjectIcon`
  switch (variableType) {
    case 'Table':
    case 'TableMap':
    case 'TreeTable':
    case 'HierarchicalTable':
    case 'PartitionedTable':
      return new vscode.ThemeIcon(ICON_ID.varTable);

    case 'deephaven.plot.express.DeephavenFigure':
    case 'Figure':
      return new vscode.ThemeIcon(ICON_ID.varFigure);

    case 'pandas.DataFrame':
      return new vscode.ThemeIcon(ICON_ID.varPandas);

    case 'deephaven.ui.Element':
    case 'OtherWidget':
    case 'Treemap':
    default:
      return new vscode.ThemeIcon(ICON_ID.varElement);
  }
}

/**
 * Get `TreeItem` for a panel connection.
 * @param connection Connection state
 * @param getConsoleType Function to get the console type for the connection.
 */
export async function getPanelConnectionTreeItem(
  connection: ConnectionState,
  getConsoleType: (
    connection: ConnectionState
  ) => Promise<ConsoleType | undefined>,
  serverLabel?: string
): Promise<vscode.TreeItem> {
  const descriptionTokens: string[] = [];

  const consoleType = await getConsoleType(connection);

  if (consoleType) {
    descriptionTokens.push(consoleType);
  }

  if (connection.tagId) {
    descriptionTokens.push(connection.tagId);
  }

  const label = serverLabel ?? connection.serverUrl.host;
  const description =
    descriptionTokens.length === 0 ? undefined : descriptionTokens.join(' - ');

  return {
    label,
    description,
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
  const iconPath = getVariableIconPath(variable.type);
  const variablesToOpen: NonEmptyArray<VariableDefintion> = [variable];

  return {
    label: variable.title,
    iconPath,
    command: {
      title: 'Open Panel',
      command: OPEN_VARIABLE_PANELS_CMD,
      arguments: [url, variablesToOpen],
    },
  };
}

/**
 * Get `contextValue` for server tree items.
 * @param isConnected Whether the server is connected
 * @param isDHE Whether the server is a DHE server
 * @param isManaged Whether the server is managed
 * @param isRunning Whether the server is running
 */
export function getServerContextValue({
  isConnected,
  isDHE,
  isManaged,
  isRunning,
}: {
  isConnected: boolean;
  isDHE: boolean;
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
    if (isDHE) {
      return isConnected
        ? SERVER_TREE_ITEM_CONTEXT.isDHEServerRunningConnected
        : SERVER_TREE_ITEM_CONTEXT.isDHEServerRunningDisconnected;
    }

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
 * @param connectionCount The number of connections to the server (will be the
 * number of connected workers in the case of DHE)
 * @param isManaged Whether the server is managed
 * @param isRunning Whether the server is running
 * @returns Tree item representing the server
 */
export function getServerTreeItem(server: ServerState): vscode.TreeItem {
  const {
    connectionCount,
    isConnected,
    isManaged = false,
    isRunning,
    type,
  } = server;

  const contextValue = getServerContextValue({
    isConnected,
    isDHE: type === 'DHE',
    isManaged,
    isRunning,
  });

  const description = getServerDescription(connectionCount, isManaged);

  const urlStr = server.url.toString();

  const canConnect =
    contextValue === SERVER_TREE_ITEM_CONTEXT.isManagedServerDisconnected ||
    contextValue === SERVER_TREE_ITEM_CONTEXT.isServerRunningDisconnected ||
    contextValue === SERVER_TREE_ITEM_CONTEXT.isDHEServerRunningConnected ||
    contextValue === SERVER_TREE_ITEM_CONTEXT.isDHEServerRunningDisconnected;

  const url = new URL(urlStr);
  const label = server.label ?? url.host;

  return {
    label,
    description,
    tooltip: canConnect ? `Click to connect to ${label}` : label,
    contextValue,
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
