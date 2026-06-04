import * as vscode from 'vscode';
import type {
  ConnectionState,
  ConsoleType,
  IServerManager,
  NonEmptyArray,
  ServerGroupState,
  ServerState,
  VariableDefintion,
  VariableType,
} from '../types';
import {
  CONNECTION_TREE_ITEM_CONTEXT,
  DH_PROTECTED_VARIABLE_NAMES,
  ICON_ID,
  OPEN_VARIABLE_PANELS_CMD,
  SERVER_TREE_ITEM_CONTEXT,
  type ServerTreeItemContextValue,
} from '../common';

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
 * Get the icon id for a console type / language, used for connection tree nodes.
 * Falls back to the generic "connected" icon when the console type is unknown
 * (e.g. a plain DHC connection or one whose console type has not resolved yet).
 * @param consoleType Console type (language) of the connection, if known.
 * @returns Icon id from `ICON_ID`.
 */
export function getConsoleTypeIconId(
  consoleType: ConsoleType | undefined
): string {
  switch (consoleType) {
    case 'python':
      return ICON_ID.python;
    case 'groovy':
      return ICON_ID.groovy;
    default:
      return ICON_ID.connected;
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
  serverLabel?: string,
  pqName?: string,
  isWorkerChild = false
): Promise<vscode.TreeItem> {
  // Console type (language) drives the node icon rather than the description.
  const consoleType = await getConsoleType(connection);

  // Prefer the persistent query name (what the DHE Query Monitor shows) over
  // the local correlation tagId. Falls back to tagId for plain DHC connections.
  const workerName = pqName ?? connection.tagId;

  // DHE worker nodes are nested under their server node, so the worker name
  // becomes the node label and the server label lives on the parent. Flat DHC
  // connections keep the server label as the node label and show the worker
  // name as the description.
  const label = isWorkerChild
    ? workerName
    : (serverLabel ?? connection.serverUrl.host);

  const description = isWorkerChild ? undefined : workerName;

  return {
    label,
    description,
    collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
    // Show the language (Python/Groovy) icon when idle/connected; show the
    // spinner while busy (connecting or running code).
    iconPath: new vscode.ThemeIcon(
      connection.isRunningCode || !connection.isConnected
        ? ICON_ID.connecting
        : getConsoleTypeIconId(consoleType)
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
    contextValue: DH_PROTECTED_VARIABLE_NAMES.has(variable.name)
      ? undefined
      : 'canDeleteDeephavenVariable',
    command: {
      title: 'Open Panel',
      command: OPEN_VARIABLE_PANELS_CMD,
      arguments: [url, variablesToOpen],
    },
  };
}

/**
 * Type guard for a (DHE) server node within the connection / panel tree root.
 * `ServerState` carries `url`; `ConnectionState` carries `serverUrl`.
 * @param node A server or connection root node.
 */
export function isServerStateNode(
  node: ServerState | ConnectionState
): node is ServerState {
  return 'url' in node;
}

/**
 * Compute the root nodes for the connection / panel tree views. DHE worker
 * connections are grouped under their parent DHE server node; DHC connections
 * remain flat top-level nodes. Roots are sorted by their displayed label.
 * @param serverManager Server manager.
 * @returns The root nodes (DHE servers and flat DHC connections).
 */
export function getConnectionTreeRootNodes(
  serverManager: IServerManager
): (ServerState | ConnectionState)[] {
  const dheServers = new Map<string, ServerState>();
  const flatConnections: ConnectionState[] = [];

  for (const connection of serverManager.getConnections()) {
    const server = serverManager.getServerForConnection(connection);
    if (server == null) {
      flatConnections.push(connection);
    } else {
      dheServers.set(server.url.toString(), server);
    }
  }

  return [...flatConnections, ...dheServers.values()].sort((a, b) =>
    getConnectionNodeSortKey(a).localeCompare(getConnectionNodeSortKey(b))
  );
}

function getConnectionNodeSortKey(
  node: ServerState | ConnectionState
): string {
  return isServerStateNode(node)
    ? (node.label ?? node.url.host)
    : node.serverUrl.host;
}

/**
 * Get `TreeItem` for a DHE server node in the connection / panel tree views.
 * This is a grouping container whose children are the server's worker
 * connections.
 * @param server DHE server state
 */
export function getConnectionServerTreeItem(
  server: ServerState
): vscode.TreeItem {
  return {
    label: server.label ?? server.url.host,
    // The "computer" icon (`vm-connect`) previously used for worker connection
    // nodes, before the language (Python/Groovy) icons took their place.
    iconPath: new vscode.ThemeIcon(ICON_ID.connected),
    collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
    contextValue: CONNECTION_TREE_ITEM_CONTEXT.isDHEServerConnectionParent,
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
