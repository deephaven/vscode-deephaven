import * as path from 'node:path';
import type { ConsoleType, TerminalQueryStatus, VariableType } from '../types';

/**
 * This value is a little bit arbitrary, but it needs to be long enough to
 * allow panels to update their `visible` property after an `onDidChangeTabs`
 * event fires. If we find that we have trouble with lazy panels not loading on
 * initial activation, we may need to increase this value. This seems to work
 * on a slower VM being used for testing whereas 50ms did not.
 */
export const DEBOUNCE_TAB_UPDATE_MS = 100;

export const EXTENSION_ID = 'vscode-deephaven' as const;

export const CONFIG_KEY = {
  root: 'deephaven',
  coreServers: 'coreServers',
  enterpriseServers: 'enterpriseServers',
  importPrefixes: 'importPrefixes',
  mcpAutoUpdateConfig: 'mcp.autoUpdateConfig',
  mcpDocsEnabled: 'mcp.docsEnabled',
  mcpEnabled: 'mcp.enabled',
} as const;

export const CENSORED_TEXT = '********' as const;

export const DEFAULT_CONSOLE_TYPE = 'python' as const;
// export const DHFS_SCHEME = 'dhfs';

// 600 seconds is based on default `auto_delete_timeout` in
// `ControllerClient.make_temporary_config`
export const DEFAULT_TEMPORARY_QUERY_AUTO_TIMEOUT_MS = 600000 as const;
export const DEFAULT_TEMPORARY_QUERY_TIMEOUT_MS = 60000 as const;

export const DH_PANEL_VIEW_TYPE = 'dhPanel';

export const INTERACTIVE_CONSOLE_QUERY_TYPE = 'InteractiveConsole';
export const INTERACTIVE_CONSOLE_TEMPORARY_QUEUE_NAME =
  'InteractiveConsoleTemporaryQueue';

export const MCP_SERVER_KEY = `${EXTENSION_ID}.mcpServer` as const;
export const MCP_SERVER_NAME = 'Deephaven VS Code MCP Server' as const;
export const MCP_SERVER_PORT_STORAGE_KEY =
  `${EXTENSION_ID}.mcpServerPort` as const;

export const MCP_DOCS_SERVER_NAME = 'Deephaven Documentation' as const;
export const MCP_DOCS_SERVER_URL =
  'https://deephaven-mcp-docs-prod.dhc-demo.deephaven.io/mcp' as const;

export const PIP_SERVER_STATUS_CHECK_INTERVAL = 3000;
export const PIP_SERVER_STATUS_CHECK_TIMEOUT = 30000;

export const STATUS_BAR_DISCONNECTED_TEXT = 'Deephaven: Disconnected';
export const STATUS_BAR_DISCONNECT_TEXT = 'Deephaven: Disconnect';
export const STATUS_BAR_CONNECTING_TEXT = 'Deephaven: Connecting...';

export const DOWNLOAD_LOGS_TEXT = 'Download Logs';

// For drag-and-dropping uris
export const MIME_TYPE = {
  uriList: 'text/uri-list',
} as const;

export const SERVER_LANGUAGE_SET = new Set([
  'python',
  'groovy',
]) as ReadonlySet<ConsoleType>;

export const TERMINAL_QUERY_STATUSES = new Set([
  'Stopping',
  'Stopped',
  'Failed',
  'Error',
  'Disconnected',
  'Completed',
]) as ReadonlySet<TerminalQueryStatus>;

/**
 * Type guard to check if a status is a terminal query status.
 * @param status The status to check.
 * @returns True if the status is a terminal query status.
 */
export function isTerminalQueryStatus(
  status: string | null | undefined
): status is TerminalQueryStatus {
  return (
    status != null && TERMINAL_QUERY_STATUSES.has(status as TerminalQueryStatus)
  );
}

/**
 * The canonical hidden-set key for "no status". A PQ can report its status as
 * `null`, `undefined`, or `''` (the JS API maps a null status to an empty
 * string), so all three normalise to this single entry.
 */
export const UNSET_QUERY_STATUS = '' as const;

/**
 * The statuses the Persistent Queries view treats as *completely stopped* — the
 * terminal statuses minus `Stopping`, plus the unset one (a stopped PQ can
 * report no status at all). A query that is `Stopping` is still in motion, so it
 * belongs with the live ones where someone watching the view can see it wind
 * down; everything here has finished moving.
 *
 * Deliberately derived from — but not equal to — {@link TERMINAL_QUERY_STATUSES}.
 * That set drives worker-lifecycle teardown in `DheService` / `dhe.ts`, where
 * `Stopping` must keep counting as terminal or a worker on its way out would
 * never be detached. Widening the terminal set automatically widens this one.
 */
export const STOPPED_QUERY_STATUSES: readonly string[] = [
  ...[...TERMINAL_QUERY_STATUSES].filter(status => status !== 'Stopping'),
  UNSET_QUERY_STATUS,
];

/**
 * Statuses hidden by the Persistent Queries status filter on first run — exactly
 * {@link STOPPED_QUERY_STATUSES}, so the view opens showing every query that is
 * running or still in motion. The filter stores what to HIDE rather than what to
 * show, so a status this extension has never heard of (a new one from a future
 * DHE release) stays visible instead of silently disappearing.
 */
export const DEFAULT_HIDDEN_QUERY_STATUSES: readonly string[] = [
  ...STOPPED_QUERY_STATUSES,
];

export const PIP_SERVER_SUPPORTED_PLATFORMS = new Set<NodeJS.Platform>([
  'darwin',
  'linux',
]);

export const TMP_DIR_ROOT = path.join(__dirname, 'tmp');

export const VIEW_CONTAINER_ID_PREFIX =
  `${EXTENSION_ID}_viewContainer_` as const;

export const VIEW_CONTAINER_ID = {
  list: `${VIEW_CONTAINER_ID_PREFIX}list`,
  detail: `${VIEW_CONTAINER_ID_PREFIX}detail`,
} as const;

export type ViewContainerID =
  (typeof VIEW_CONTAINER_ID)[keyof typeof VIEW_CONTAINER_ID];

export const VIEW_ID_PREFIX = `${EXTENSION_ID}.view.` as const;

export const VIEW_ID = {
  createQuery: `${VIEW_ID_PREFIX}createQuery`,
  remoteImportSourceTree: `${VIEW_ID_PREFIX}remoteImportSourceTree`,
  serverTree: `${VIEW_ID_PREFIX}serverTree`,
  serverConnectionTree: `${VIEW_ID_PREFIX}serverConnectionTree`,
  persistentQueryTree: `${VIEW_ID_PREFIX}persistentQueryTree`,
  variablePanel: `${VIEW_ID_PREFIX}variablePanel`,
} as const;

export type ViewID = (typeof VIEW_ID)[keyof typeof VIEW_ID];

export const ICON_ID = {
  blank: 'blank',
  connected: 'vm-connect',
  connecting: 'sync~spin',
  disconnected: 'plug',
  groovy: 'coffee',
  python: 'dh-python',
  runAll: 'run-all',
  runSelection: 'run',
  runningCode: 'sync~spin',
  saml: 'shield',
  server: 'server',
  serverConnected: 'circle-large-filled',
  serverRunning: 'circle-large-outline',
  serverStopped: 'circle-slash',
  varFigure: 'graph',
  varElement: 'preview',
  varPandas: 'dh-pandas',
  varTable: 'dh-table',
  /**
   * Fallback icon for a worker node (connection / persistent query) whose script
   * language isn't known. Deliberately not `connected` (`vm-connect`) — that's
   * the parent server node's icon, and a worker should never look like its
   * server.
   */
  worker: 'remote',
} as const;

/**
 * Variable types that can open as a Deephaven panel. Anything not listed is
 * hidden from panel lists rather than opening a panel that never renders.
 *
 * This is an allow-list because a worker's exported objects include plenty of
 * things that are not panels at all — DHE service objects (`AclService` and
 * friends), dashboards, and legacy widget types — and nothing on the object says
 * so. The web UI decides by looking the type up in its widget-plugin registry
 * (`WidgetLoaderPlugin.handlePanelOpen` silently returns when no plugin claims
 * the type), a registry assembled at runtime from the plugins a given worker
 * kind serves and therefore not inspectable from the extension host.
 *
 * The entries mirror the types the bundled web plugins claim — Grid
 * (`Table`/`TreeTable`/`HierarchicalTable`/`PartitionedTable`), Chart (`Figure`),
 * Pandas (`pandas.DataFrame`) — plus the two first-party plugin widgets
 * (`deephaven.ui.Element`, `deephaven.plot.express.DeephavenFigure`).
 *
 * Deliberately absent:
 * - `deephaven.ui.Dashboard`: a dashboard, not a panel (the web client excludes
 *   it from its own Panels menu — iris `QueryListUtils.filterPanelWidgets`).
 * - `TableMap` / `Treemap`: legacy `dh.VariableType` members no plugin claims
 *   (`TableMap` was superseded by `PartitionedTable`).
 * - `OtherWidget`: the server's catch-all for a widget with no specific type;
 *   no bundled plugin claims it.
 *
 * TRADEOFF: a server-side JS plugin defining its own widget type will be hidden
 * until its type is added here. That is the cost of the allow-list — the
 * alternative surfaces unopenable service objects.
 */
export const OPENABLE_PANEL_VARIABLE_TYPES: ReadonlySet<string> = new Set([
  'deephaven.plot.express.DeephavenFigure',
  'deephaven.ui.Element',
  'Figure',
  'HierarchicalTable',
  'pandas.DataFrame',
  'PartitionedTable',
  'Table',
  'TreeTable',
]);

/* eslint-disable @typescript-eslint/naming-convention */
export const VARIABLE_UNICODE_ICONS = {
  'deephaven.plot.express.DeephavenFigure': '📈',
  'deephaven.ui.Element': '✨',
  Figure: '📈',
  HierarchicalTable: '▤',
  OtherWidget: '⬜',
  'pandas.DataFrame': '🐼',
  PartitionedTable: '▤',
  Table: '▤',
  TableMap: '▤',
  Treemap: '▤',
  TreeTable: '▤',
} as const satisfies Record<VariableType, string>;
/* eslint-enable @typescript-eslint/naming-convention */

export const CONNECTION_TREE_ITEM_CONTEXT = {
  isConnectionConnected: (isOwned: boolean) =>
    `isConnectionConnected${isOwned ? 'Removable' : ''}`,
  isConnectionConnecting: (isOwned: boolean) =>
    `isConnectionConnecting${isOwned ? 'Removable' : ''}`,
  isDHEServerConnectionParent: 'isDHEServerConnectionParent',
  isUri: 'isUri',
} as const;

export const PERSISTENT_QUERY_TREE_ITEM_CONTEXT = {
  /** A DHE server grouping its persistent queries. */
  isPersistentQueryServer: 'isPersistentQueryServer',
  /** A (non-InteractiveConsole) persistent query node. */
  isPersistentQuery: 'isPersistentQuery',
} as const;

export const PIP_SERVER_STATUS_DIRECTORY = 'pip-server-status';

export const SERVER_TREE_ITEM_CONTEXT = {
  canStartServer: 'canStartServer',
  isDHEServerRunningConnected: 'isDHEServerRunningConnected',
  isDHEServerRunningDisconnected: 'isDHEServerRunningDisconnected',
  isManagedServerConnected: 'isManagedServerConnected',
  isManagedServerConnecting: 'isManagedServerConnecting',
  isManagedServerDisconnected: 'isManagedServerDisconnected',
  isServerConnecting: 'isServerConnecting',
  isServerRunningConnected: 'isServerRunningConnected',
  isServerRunningDisconnected: 'isServerRunningDisconnected',
  isServerStopped: 'isServerStopped',
} as const;

export type ServerTreeItemContextValue = keyof typeof SERVER_TREE_ITEM_CONTEXT;

/**
 * Table to store Python dependency names + versions used to generate a
 * requirements.txt file
 */
export const REQUIREMENTS_TABLE_NAME = '__vscode_requirements';
export const REQUIREMENTS_TABLE_NAME_COLUMN_NAME = 'Name';
export const REQUIREMENTS_TABLE_VERSION_COLUMN_NAME = 'Version';

/**
 * Query installed Python package names + versions and store in a DH Table.
 */
export const REQUIREMENTS_QUERY_TXT = `from deephaven import new_table
from deephaven.column import string_col
from importlib.metadata import packages_distributions, version

installed = {pkg for pkgs in packages_distributions().values() for pkg in pkgs}

${REQUIREMENTS_TABLE_NAME} = new_table([
    string_col("${REQUIREMENTS_TABLE_NAME_COLUMN_NAME}", list(installed)),
    string_col("${REQUIREMENTS_TABLE_VERSION_COLUMN_NAME}", [version(pkg) for pkg in installed])
])` as const;

export const AUTH_CONFIG_PASSWORDS_ENABLED =
  'authentication.passwordsEnabled' as const;
export const AUTH_CONFIG_CUSTOM_LOGIN_CLASS_SAML_AUTH =
  'authentication.client.customlogin.class.SAMLAuth' as const;
export const AUTH_CONFIG_SAML_PROVIDER_NAME =
  'authentication.client.samlauth.provider.name' as const;
export const AUTH_CONFIG_SAML_LOGIN_URL =
  'authentication.client.samlauth.login.url' as const;

export const CREATE_QUERY_SETTINGS_STORAGE_KEY = 'createQuerySettings' as const;

/**
 * `globalState` key for the Persistent Queries status filter (the set of
 * statuses to hide). Global rather than workspace scoped so the filter follows
 * the user across workspaces, matching `CREATE_QUERY_SETTINGS_STORAGE_KEY`.
 */
export const PERSISTENT_QUERY_HIDDEN_STATUSES_STORAGE_KEY =
  'persistentQueryHiddenStatuses' as const;

export const DH_SAML_AUTH_PROVIDER_TYPE = 'dhsaml' as const;
export const DH_SAML_SERVER_URL_SCOPE_KEY = 'deephaven.samlServerUrl' as const;
export const DH_SAML_LOGIN_URL_SCOPE_KEY = 'deephaven.samlLoginUrl' as const;

export const DHE_CREATE_QUERY_URL_PATH =
  '/iriside/iframecontent/createworker' as const;

export const DHE_FEATURES_URL_PATH = '/iriside/features.json' as const;

export const DH_PYTHON_REMOTE_SOURCE_PLUGIN_VARIABLE =
  '__deephaven_vscode' as const;
export const DH_PYTHON_REMOTE_SOURCE_PLUGIN_CLASS =
  'DeephavenPythonRemoteFileSourcePlugin' as const;

export const DH_PROTECTED_VARIABLE_NAMES: Set<string> = new Set([
  DH_PYTHON_REMOTE_SOURCE_PLUGIN_VARIABLE,
]);

export const PROTOCOL = {
  /* eslint-disable @typescript-eslint/naming-convention */
  COMMUNITY: 'Community',
  ENTERPRISE_COMM: 'EnterpriseComm',
  ENTERPRISE_WEBSOCKET: 'EnterpriseWebsocket',
  /* eslint-enable @typescript-eslint/naming-convention */
} as const;
