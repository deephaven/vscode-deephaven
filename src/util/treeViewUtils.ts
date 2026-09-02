import * as vscode from 'vscode';
import type { QueryInfo } from '@deephaven-enterprise/jsapi-types';
import type {
  ConnectionState,
  ConsoleType,
  IPanelService,
  IServerManager,
  NonEmptyArray,
  PersistentQueryHiddenNode,
  PersistentQueryNode,
  PersistentQueryTreeNode,
  ServerGroupState,
  ServerState,
  VariableDefintion,
  VariableType,
} from '../types';
import {
  CONNECTION_TREE_ITEM_CONTEXT,
  DH_PROTECTED_VARIABLE_NAMES,
  FILTER_PERSISTENT_QUERIES_CMD,
  ICON_ID,
  isSettledQueryStatus,
  OPEN_VARIABLE_PANELS_CMD,
  PERSISTENT_QUERY_TREE_ITEM_CONTEXT,
  SERVER_TREE_ITEM_CONTEXT,
  type ServerTreeItemContextValue,
} from '../common';
import { formatCount, sortByStringProp } from './dataUtils';
import { isOpenablePanelVariable } from './panelUtils';

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
 * Separator DHE worker names are built from (e.g. `Code Studio - Web - <id>`,
 * `IC - VS Code - <tagId>`).
 */
const WORKER_LABEL_SEPARATOR = ' - ';

/** Number of characters of a worker name's trailing id segment to keep. */
const WORKER_LABEL_ID_LENGTH = 6;

/**
 * Shorten a worker name for display in a tree node. DHE worker names end in a
 * generated id (`Code Studio - Web - l9hnYDTiEosKmJwe4Fma5`) that is long enough
 * to push the meaningful part of the name out of the sidebar, so the trailing
 * segment is clipped to its first few characters. Callers pair this with the
 * untruncated name as the node tooltip.
 *
 * Only a name with at least three ` - ` segments is touched, and only when its
 * last segment looks like an id (no whitespace) and is long enough to be worth
 * clipping — a name like `IC - VS Code` (no id) is left alone.
 * @param label The full worker name.
 * @returns The name to show on the node.
 */
export function getWorkerNodeLabel(label: string): string {
  const segments = label.split(WORKER_LABEL_SEPARATOR);

  if (segments.length < 3) {
    return label;
  }

  const id = segments[segments.length - 1];

  if (/\s/.test(id) || id.length <= WORKER_LABEL_ID_LENGTH) {
    return label;
  }

  return [...segments.slice(0, -1), id.slice(0, WORKER_LABEL_ID_LENGTH)].join(
    WORKER_LABEL_SEPARATOR
  );
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
 * The openable panel variables of a worker, as the `[URL, VariableDefintion]`
 * leaves both worker-hosting trees render. Variables that cannot open as a
 * panel are dropped rather than rendering a node that clicks onto nothing, and
 * the rest are alphabetized by title.
 * @param panelService Panel service holding the worker's variables.
 * @param serverUrl The worker URL whose variables to list.
 */
export function getPanelVariableLeaves(
  panelService: IPanelService,
  serverUrl: URL
): [URL, VariableDefintion][] {
  return [...panelService.getVariables(serverUrl)]
    .filter(isOpenablePanelVariable)
    .sort(sortByStringProp('title'))
    .map(variable => [serverUrl, variable]);
}

/**
 * Get the status icon for a persistent query, using the same circle vocabulary
 * as the Servers tree:
 * - `Running` -> filled circle.
 * - unset -> open circle. A PQ can be listed before it has a `designated` block,
 *   and neither the stop sign nor the spinner would be true of it.
 * - settled (`Stopped`, `Failed`, ...) -> stop sign.
 * - anything else -> spinner, i.e. every transitional status (`Initializing`,
 *   `Stopping`, ...) and any status this extension doesn't recognize. Note that
 *   `Stopping` is grouped under "Stopped" by the filter but is still in motion,
 *   so it lands here rather than on the stop sign.
 * @param status The PQ status.
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

  if (isSettledQueryStatus(status)) {
    return ICON_ID.serverStopped;
  }

  return ICON_ID.connecting;
}

/**
 * Get the status of a persistent query.
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
 * worker connection or node expansion required — filtered to the ones that can
 * open as a panel, so a PQ never gets an expander whose children open onto
 * nothing.
 * @param queryInfo The PQ whose exported objects to read.
 */
function getPersistentQueryObjects(queryInfo: QueryInfo): VariableDefintion[] {
  const objects = queryInfo.designated?.objects ?? [];

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
 * Get `TreeItem` for a persistent-query node. The node carries the PQ name plus
 * its {@link getPersistentQueryIconId} status circle, and is collapsible only
 * when the PQ exposes objects *and* those objects can be opened
 * ({@link canBrowsePersistentQueryObjects}) — both known from `designated`, with
 * no connection required. That keeps an expander off PQs that could only ever
 * show an empty list; an expanded node can still come up empty if registering
 * the browse connection fails.
 * @param node The persistent-query node.
 */
export function getPersistentQueryTreeItem(
  node: PersistentQueryNode
): vscode.TreeItem {
  const { queryInfo } = node;
  const status = getPersistentQueryStatus(queryInfo);

  const objects = getPersistentQueryObjects(queryInfo);
  const tableCount = objects.filter(obj =>
    TABLE_VARIABLE_TYPES.has(obj.type)
  ).length;
  const canBrowse = canBrowsePersistentQueryObjects(queryInfo);

  const plural = (count: number, noun: string): string =>
    `${count} ${noun}${count === 1 ? '' : 's'}`;

  const tooltipParts = [queryInfo.name];
  if (status != null) {
    tooltipParts.push(` (${status})`);
  }
  if (objects.length === 0) {
    tooltipParts.push(' — no objects');
  } else {
    tooltipParts.push(` — ${plural(objects.length, 'object')}`);
    if (tableCount > 0) {
      tooltipParts.push(` (${plural(tableCount, 'table')})`);
    }
    if (!canBrowse) {
      tooltipParts.push(' (worker not browsable)');
    }
  }

  return {
    // Serial, not name: VS Code falls back to generating an id from the label
    // when none is given, and two queries on a server can share a name. The
    // colliding ids that produces confuse selection and the tree's find widget.
    id: `pq:${node.dheServerUrl.href}:${queryInfo.serial}`,
    label: queryInfo.name,
    description: queryInfo.owner ?? undefined,
    tooltip: tooltipParts.join(''),
    iconPath: new vscode.ThemeIcon(getPersistentQueryIconId(status)),
    collapsibleState:
      objects.length > 0 && canBrowse
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    contextValue: PERSISTENT_QUERY_TREE_ITEM_CONTEXT.isPersistentQuery,
  };
}

/**
 * Get `TreeItem` for the trailing "N hidden" node under a filtered server. The
 * node exists so a filter is never a silent omission: it states the count and
 * clicking it reopens the picker that produced it.
 * @param node The hidden-count node.
 */
export function getPersistentQueryHiddenTreeItem(
  node: PersistentQueryHiddenNode
): vscode.TreeItem {
  const { hiddenCount } = node;

  return {
    // Fixed id: the label carries a count that changes on every table tick, and
    // a label-generated id would make this a different node each time.
    id: `pq:${node.dheServerUrl.href}:more`,
    label: `More (${formatCount(hiddenCount)})`,
    tooltip: `${formatCount(hiddenCount)} ${
      hiddenCount === 1 ? 'query is' : 'queries are'
    } hidden by the status filter. Click to change it.`,
    iconPath: new vscode.ThemeIcon(ICON_ID.hidden),
    collapsibleState: vscode.TreeItemCollapsibleState.None,
    contextValue: PERSISTENT_QUERY_TREE_ITEM_CONTEXT.isPersistentQueryHidden,
    command: {
      title: 'Filter Persistent Queries',
      command: FILTER_PERSISTENT_QUERIES_CMD,
    },
  };
}

/**
 * Type guard for the trailing hidden-count node. It carries a `hiddenCount`,
 * which nothing else in the Persistent Queries tree does.
 * @param node The node to check.
 */
export function isPersistentQueryHiddenNode(
  node: PersistentQueryTreeNode
): node is PersistentQueryHiddenNode {
  return (node as PersistentQueryHiddenNode).hiddenCount != null;
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
    id: `pq:${server.url.href}`,
    label: getConnectionServerLabel(server),
    iconPath: new vscode.ThemeIcon(ICON_ID.connected),
    collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
    contextValue: PERSISTENT_QUERY_TREE_ITEM_CONTEXT.isPersistentQueryServer,
  };
}

/**
 * Type guard distinguishing a persistent-query node from the server or
 * connection nodes it shares a tree with. A `PersistentQueryNode` carries a
 * `queryInfo`.
 * @param node The node to check.
 */
export function isPersistentQueryNode(
  node:
    | ServerState
    | ConnectionState
    | PersistentQueryHiddenNode
    | PersistentQueryNode
): node is PersistentQueryNode {
  return (node as PersistentQueryNode).queryInfo != null;
}

/**
 * Map a PQ's openable exported objects to `[URL, VariableDefintion]` leaves
 * paired with the given worker URL — the same shape the Interactive Consoles
 * tree uses.
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
 * Type guard for a (DHE) server node within the connection tree root.
 * `ServerState` carries `url`; `ConnectionState` carries `serverUrl`.
 * @param node A server or connection root node.
 */
export function isServerStateNode(
  node: ServerState | ConnectionState
): node is ServerState {
  return 'url' in node;
}

/**
 * Get the label shown for a server node in the connection tree views.
 * @param server Server state.
 */
export function getConnectionServerLabel(server: ServerState): string {
  return server.label ?? server.url.host;
}

/**
 * Compute the root nodes for the connection tree view. Every
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
 * Get `TreeItem` for a DHE server node in the connection tree view.
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
