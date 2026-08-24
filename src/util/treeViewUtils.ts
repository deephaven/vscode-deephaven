import * as vscode from 'vscode';
import type { QueryInfo } from '@deephaven-enterprise/jsapi-types';
import type {
  ConnectionState,
  ConsoleType,
  IServerManager,
  NonEmptyArray,
  PersistentQueryNode,
  ServerGroupState,
  ServerState,
  VariableDefintion,
  VariableType,
} from '../types';
import {
  CONNECTION_TREE_ITEM_CONTEXT,
  DH_PROTECTED_VARIABLE_NAMES,
  ICON_ID,
  isTerminalQueryStatus,
  OPEN_VARIABLE_PANELS_CMD,
  PERSISTENT_QUERY_TREE_ITEM_CONTEXT,
  SERVER_TREE_ITEM_CONTEXT,
  type ServerTreeItemContextValue,
} from '../common';
import { isOpenablePanelVariable } from './panelUtils';
import { getScriptLanguageConsoleType } from './serverUtils';

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
 * Get the icon id for a console type / language, used for worker (connection /
 * persistent query) tree nodes. Falls back to the generic worker icon when the
 * console type is unknown (e.g. a plain DHC connection or one whose console type
 * has not resolved yet) — never the server icon, so a worker node is always
 * distinguishable from its parent server.
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
      return ICON_ID.worker;
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
  label: string
): Promise<vscode.TreeItem> {
  // Console type (language) drives the node icon rather than the description.
  const consoleType = await getConsoleType(connection);

  return {
    label,
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
 * @param variable The worker URL + variable to render.
 * @param canDelete Whether the node offers the delete (trash) action. Only
 * variables living in a console session can be deleted — a persistent query's
 * exported objects are browse-only, so the action must not be offered for them
 * (`ExtensionController.onDeleteVariable` would ignore it anyway, leaving a
 * button that does nothing).
 */
export function getPanelVariableTreeItem(
  [url, variable]: [URL, VariableDefintion],
  canDelete: boolean
): vscode.TreeItem {
  const iconPath = getVariableIconPath(variable.type);
  const variablesToOpen: NonEmptyArray<VariableDefintion> = [variable];

  return {
    label: variable.title,
    iconPath,
    contextValue:
      canDelete && !DH_PROTECTED_VARIABLE_NAMES.has(variable.name)
        ? 'canDeleteDeephavenVariable'
        : undefined,
    command: {
      title: 'Open Panel',
      command: OPEN_VARIABLE_PANELS_CMD,
      arguments: [url, variablesToOpen],
    },
  };
}

/**
 * How a persistent-query node draws its icon. Each tree picks the vocabulary
 * that keeps it internally consistent:
 * - `'status'` (Persistent Queries tree): the Servers-tree circles, since that
 *   view is about PQ lifecycle and lists PQs of every status.
 * - `'language'` (Panels tree): the script-language icon, matching the console
 *   worker nodes a PQ sits alongside there.
 */
export type PersistentQueryIconStyle = 'status' | 'language';

/**
 * Get the status icon for a persistent query, using the same circle vocabulary
 * as the Servers tree:
 * - `Running` → filled circle.
 * - terminal (`Stopped`, `Failed`, …) → stop sign.
 * - unset → open circle. An unknown status is NOT the same as a stopped one: a
 *   PQ can be listed with no status yet (no `designated` block), and claiming it
 *   stopped would be wrong. A spinner would be equally wrong — nothing is known
 *   to be in progress.
 * - anything else (`Initializing`, `Connecting`, …) → spinner.
 * @param status The PQ status (`designated.status`, falling back to `status`).
 */
export function getPersistentQueryIconId(
  status: string | null | undefined
): string {
  if (status === 'Running') {
    return ICON_ID.serverConnected;
  }

  if (status == null || status === '') {
    return ICON_ID.serverRunning;
  }

  if (isTerminalQueryStatus(status)) {
    return ICON_ID.serverStopped;
  }

  return ICON_ID.connecting;
}

/**
 * Get the script-language icon for a persistent query — the same icon its
 * console-worker siblings use in the Panels tree. Falls back to the generic
 * worker icon when the language is unset / unrecognized.
 * @param scriptLanguage The `queryInfo.scriptLanguage` value (e.g. `'Python'`).
 */
export function getPersistentQueryLanguageIconId(
  scriptLanguage?: string | null
): string {
  return getConsoleTypeIconId(getScriptLanguageConsoleType(scriptLanguage));
}

/**
 * Get the the status of a persistent query.
 * @param queryInfo The PQ whose status to read.
 */
export function getPersistentQueryStatus(
  queryInfo: QueryInfo
): string | null | undefined {
  return queryInfo.designated?.status;
}

/** Variable types that render as tables (mirrors the table icon set). */
const TABLE_VARIABLE_TYPES: ReadonlySet<VariableType> = new Set([
  'Table',
  'TableMap',
  'TreeTable',
  'HierarchicalTable',
  'PartitionedTable',
]);

/**
 * The exported objects of a PQ, read straight from `designated.objects` — no
 * worker connection or node expansion required — filtered to the named + typed
 * entries that render as object leaves. This is the same set
 * {@link getPersistentQueryObjectLeaves} produces, so a caller can cheaply tell
 * whether a PQ has any (or any table-typed) objects before expanding it.
 * @param queryInfo The PQ whose exported objects to read.
 */
export function getPersistentQueryObjects(
  queryInfo: QueryInfo
): VariableDefintion[] {
  const objects = queryInfo.designated?.objects ?? [];
  // Only objects that can actually open as a panel: counting an unopenable one
  // would put an expander on a PQ whose children open onto nothing.
  return objects.filter((obj): obj is VariableDefintion =>
    isOpenablePanelVariable(obj)
  );
}

/**
 * Whether a PQ's exported objects can actually be opened. The tree opens them
 * through a browse connection derived from the designated worker
 * (`getWorkerInfoFromQueryInfo`), which requires both `jsApiUrl` and `ideUrl`.
 * Helper / system queries (e.g. `RevertHelper`) can be `Running` and report
 * objects while having no IDE endpoint (`designated.ideUrl` is nullable), so
 * without this check they render an expander that can never produce children.
 * @param queryInfo The PQ to check.
 */
export function canBrowsePersistentQueryObjects(queryInfo: QueryInfo): boolean {
  const { designated } = queryInfo;

  return (
    designated != null &&
    designated.jsApiUrl != null &&
    designated.jsApiUrl !== '' &&
    designated.ideUrl != null &&
    designated.ideUrl !== ''
  );
}

/**
 * Whether a PQ exposes at least one table-typed object, determined from
 * `designated.objects` without connecting to or expanding the PQ.
 * @param queryInfo The PQ to check.
 */
export function persistentQueryHasTables(queryInfo: QueryInfo): boolean {
  return getPersistentQueryObjects(queryInfo).some(obj =>
    TABLE_VARIABLE_TYPES.has(obj.type)
  );
}

/**
 * Get `TreeItem` for a persistent-query node. The node carries the PQ name plus
 * the icon its host tree calls for ({@link PersistentQueryIconStyle}), and is
 * collapsible only when the PQ exposes objects *and* those objects can be opened
 * ({@link canBrowsePersistentQueryObjects}) — otherwise it renders
 * non-expandable so the tree never opens onto an empty list (both are known
 * cheaply from `designated`, no connection required).
 * @param node The persistent-query node.
 * @param iconStyle Which icon vocabulary the host tree uses.
 */
export function getPersistentQueryTreeItem(
  node: PersistentQueryNode,
  iconStyle: PersistentQueryIconStyle
): vscode.TreeItem {
  const { queryInfo } = node;
  const status = getPersistentQueryStatus(queryInfo);

  const objects = getPersistentQueryObjects(queryInfo);
  const tableCount = objects.filter(obj =>
    TABLE_VARIABLE_TYPES.has(obj.type)
  ).length;
  const canBrowse = canBrowsePersistentQueryObjects(queryInfo);

  const plural = (n: number, noun: string): string =>
    `${n} ${noun}${n === 1 ? '' : 's'}`;
  const countSuffix =
    objects.length === 0
      ? ' — no objects'
      : ` — ${plural(objects.length, 'object')}${tableCount > 0 ? ` (${plural(tableCount, 'table')})` : ''}${canBrowse ? '' : ' (worker not browsable)'}`;

  return {
    label: queryInfo.name,
    description: queryInfo.owner ?? undefined,
    tooltip: `${queryInfo.name}${status == null ? '' : ` (${status})`}${countSuffix}`,
    iconPath: new vscode.ThemeIcon(
      iconStyle === 'language'
        ? getPersistentQueryLanguageIconId(queryInfo.scriptLanguage)
        : getPersistentQueryIconId(status)
    ),
    collapsibleState:
      objects.length > 0 && canBrowse
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    contextValue: PERSISTENT_QUERY_TREE_ITEM_CONTEXT.isPersistentQuery,
  };
}

/**
 * Get `TreeItem` for a DHE server node in the Persistent Queries tree. This is a
 * grouping container whose children are the server's (non-InteractiveConsole)
 * persistent queries.
 * @param server DHE server state.
 */
export function getPersistentQueryServerTreeItem(
  server: ServerState
): vscode.TreeItem {
  return {
    label: getConnectionServerLabel(server),
    iconPath: new vscode.ThemeIcon(ICON_ID.connected),
    collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
    contextValue: PERSISTENT_QUERY_TREE_ITEM_CONTEXT.isPersistentQueryServer,
  };
}

/**
 * Type guard distinguishing a persistent-query node from a server or connection
 * node (both the Persistent Queries and Panels trees mix them). A
 * `PersistentQueryNode` carries a `queryInfo`.
 * @param node The node to check.
 */
export function isPersistentQueryNode(
  node: ServerState | ConnectionState | PersistentQueryNode
): node is PersistentQueryNode {
  return (node as PersistentQueryNode).queryInfo != null;
}

/**
 * Map a `QueryInfo`'s exported objects (`designated.objects`) to
 * `VariableDefintion` leaves paired with the given worker URL — the same
 * `[URL, VariableDefintion]` shape the Panels tree uses for object leaves.
 * Filters out unnamed / untyped entries defensively.
 * @param workerUrl The worker URL objects are hosted on (for the open command).
 * @param queryInfo The running PQ whose objects to enumerate.
 */
export function getPersistentQueryObjectLeaves(
  workerUrl: URL,
  queryInfo: QueryInfo
): [URL, VariableDefintion][] {
  return getPersistentQueryObjects(queryInfo).map(obj => [workerUrl, obj]);
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
 * Get the label shown for a server node in the connection / panel tree views.
 * @param server Server state.
 */
export function getConnectionServerLabel(server: ServerState): string {
  return server.label ?? server.url.host;
}

/**
 * Compute the root nodes for the connection / panel tree views. Every
 * connection is grouped under its parent server node (DHC and DHE alike), so a
 * community server with a single worker has the same hierarchy shape as an
 * enterprise server with many. Roots are sorted by their displayed label.
 *
 * In addition to every server that has connections, any DHE server with a live
 * client is included so its node (and its "+" create-worker action) stays
 * reachable even with zero workers.
 * @param serverManager Server manager.
 * @returns The server root nodes (servers with connections, plus connected DHE
 * servers).
 */
export function getConnectionTreeRootNodes(
  serverManager: IServerManager
): ServerState[] {
  const servers = new Map<string, ServerState>();

  for (const connection of serverManager.getConnections()) {
    const server = serverManager.getServerForConnection(connection);
    if (server != null) {
      servers.set(server.url.toString(), server);
    }
  }

  // DHE servers with a live client appear even with zero workers, so the server
  // node (and its "+" create-worker action) stays reachable after a cancelled
  // worker creation or after the last worker is detached.
  for (const server of serverManager.getServers({ type: 'DHE' })) {
    if (server.isConnected) {
      servers.set(server.url.toString(), server);
    }
  }

  return [...servers.values()].sort((a, b) =>
    getConnectionServerLabel(a).localeCompare(getConnectionServerLabel(b))
  );
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
    label: getConnectionServerLabel(server),
    iconPath: new vscode.ThemeIcon(ICON_ID.connected),
    collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
    contextValue:
      server.type === 'DHE'
        ? CONNECTION_TREE_ITEM_CONTEXT.isDHEServerConnectionParent
        : undefined,
  };
}

/**
 * Get `contextValue` for server tree items.
 * @param isConnected Whether the server is connected
 * @param isConnecting Whether a client connection is currently being established
 * @param isDHE Whether the server is a DHE server
 * @param isManaged Whether the server is managed
 * @param isRunning Whether the server is running
 */
export function getServerContextValue({
  isConnected,
  isConnecting,
  isDHE,
  isManaged,
  isRunning,
}: {
  isConnected: boolean;
  isConnecting: boolean;
  isDHE: boolean;
  isManaged: boolean;
  isRunning: boolean;
}): ServerTreeItemContextValue {
  if (isConnecting) {
    return SERVER_TREE_ITEM_CONTEXT.isServerConnecting;
  }

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
 * @param isConnecting Whether a client connection is currently being established
 * @param isManaged Whether the server is managed
 * @param isRunning Whether the server is running
 * @returns Icon id for server tree item
 */
export function getServerIconID({
  isConnected,
  isConnecting,
  isManaged,
  isRunning,
}: {
  isConnected: boolean;
  isConnecting: boolean;
  isManaged: boolean;
  isRunning: boolean;
}): string {
  if (isConnecting) {
    return ICON_ID.connecting;
  }

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
 * @param isConnecting Whether a client connection is currently being established
 * @returns Tree item representing the server
 */
export function getServerTreeItem(
  server: ServerState,
  isConnecting: boolean
): vscode.TreeItem {
  const {
    connectionCount,
    isConnected,
    isManaged = false,
    isRunning,
    type,
  } = server;

  const contextValue = getServerContextValue({
    isConnected,
    isConnecting,
    isDHE: type === 'DHE',
    isManaged,
    isRunning,
  });

  const description = getServerDescription(connectionCount, isManaged);

  const canConnect =
    contextValue === SERVER_TREE_ITEM_CONTEXT.isManagedServerDisconnected ||
    contextValue === SERVER_TREE_ITEM_CONTEXT.isServerRunningDisconnected ||
    contextValue === SERVER_TREE_ITEM_CONTEXT.isDHEServerRunningConnected ||
    contextValue === SERVER_TREE_ITEM_CONTEXT.isDHEServerRunningDisconnected;

  const label = getConnectionServerLabel(server);

  return {
    label,
    description,
    tooltip: isConnecting
      ? `Connecting to ${label}…`
      : canConnect
        ? `Click to connect to ${label}`
        : label,
    contextValue,
    iconPath: new vscode.ThemeIcon(
      getServerIconID({ isConnected, isConnecting, isManaged, isRunning })
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
