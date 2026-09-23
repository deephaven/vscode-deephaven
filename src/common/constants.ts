import * as path from 'node:path';
import {
  NON_RUNNING_STATUSES,
  QueryStatus,
} from '@deephaven-enterprise/query-utils';
import type { ConsoleType } from '../types';

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

/**
 * Minimum milliseconds between `QueryInfo` table update notifications. The table
 * ticks on every row add/remove and status transition, so on a server holding
 * tens of thousands of queries an unthrottled tick would refresh the Persistent
 * Queries tree continuously.
 */
export const QUERY_INFO_UPDATE_INTERVAL_MS = 250;

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

/**
 * Whether a status is in NON_RUNNING_STATUSES or is `QueryStatus.stopping`.
 * @param status The status to check.
 * @returns True if the status is a terminal query status.
 */
export function isTerminalQueryStatus(
  status: string | null | undefined
): boolean {
  return (
    NON_RUNNING_STATUSES.has(status ?? QueryStatus.none) ||
    status === QueryStatus.stopping
  );
}

/**
 * For cases where we subscribe to query status updates before queries have been
 * initialized, we want to exclude terminal statuses that could be ones just
 * getting started.
 * @param status The status to check.
 * @returns True if the query has yet to start.
 */
export function isPreInitQueryStatus(
  status: string | null | undefined
): boolean {
  return (
    status == null ||
    status === QueryStatus.none ||
    status === QueryStatus.uninitialized
  );
}

/**
 * Every status the enterprise `QueryStatus` vocabulary defines, in declaration
 * order. Read off the class so a status the package adds is picked up here
 * (`constants.spec.ts` guards the assumption that these are enumerable).
 */
export const ALL_QUERY_STATUSES: readonly string[] = Object.values(
  QueryStatus
).filter((value): value is string => typeof value === 'string');

/** The two halves the Persistent Queries status filter can toggle at once. */
export type QueryStatusSection = 'Running' | 'Stopped';

/**
 * The statuses making up a {@link QueryStatusSection} — the vocabulary split by
 * {@link isTerminalQueryStatus}, so the sections cannot drift from it or from
 * each other. A status the extension doesn't recognize is in neither, and the
 * picker gives it an "unrecognized" row of its own.
 * @param section The section whose statuses to list.
 */
export function getQueryStatusSectionStatuses(
  section: QueryStatusSection
): readonly string[] {
  const isStoppedSection = section === 'Stopped';

  return ALL_QUERY_STATUSES.filter(
    status => isTerminalQueryStatus(status) === isStoppedSection
  );
}

/**
 * Statuses hidden by the Persistent Queries status filter on first run, so the
 * view opens showing every query that is running or still in motion.
 */
export const DEFAULT_HIDDEN_QUERY_STATUSES =
  getQueryStatusSectionStatuses('Stopped');

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
  /** Trailing node standing in for the queries a filter is hiding. */
  hidden: 'ellipsis',
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
   * language isn't known. Not `connected` (`vm-connect`) — that is the parent
   * server node's icon, and a worker should never look like its server.
   */
  worker: 'remote',
} as const;

/* eslint-disable @typescript-eslint/naming-convention */
export const VARIABLE_UNICODE_ICONS: Record<string, string | undefined> = {
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
};
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
  /** The trailing "N hidden" node under a filtered server. */
  isPersistentQueryHidden: 'isPersistentQueryHidden',
} as const;

export const PIP_SERVER_STATUS_DIRECTORY = 'pip-server-status';

export const SERVER_TREE_ITEM_CONTEXT = {
  canStartServer: 'canStartServer',
  isDHEServerRunningConnected: 'isDHEServerRunningConnected',
  isDHEServerRunningDisconnected: 'isDHEServerRunningDisconnected',
  isManagedServerConnected: 'isManagedServerConnected',
  isManagedServerConnecting: 'isManagedServerConnecting',
  isManagedServerDisconnected: 'isManagedServerDisconnected',
  isManagedServerStarting: 'isManagedServerStarting',
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
