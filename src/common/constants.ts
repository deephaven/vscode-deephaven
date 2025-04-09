import * as path from 'node:path';
import type { ConsoleType, VariableType } from '../types';

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

export const PIP_SERVER_SUPPORTED_PLATFORMS = new Set<NodeJS.Platform>([
  'darwin',
  'linux',
]);

export const TMP_DIR_ROOT = path.join(__dirname, 'tmp');

export const VIEW_ID = {
  createQueryView: `${EXTENSION_ID}.createQueryView`,
  serverTree: `${EXTENSION_ID}.serverTree`,
  serverConnectionTree: `${EXTENSION_ID}.serverConnectionTree`,
  serverConnectionPanelTree: `${EXTENSION_ID}.serverConnectionPanelTree`,
} as const;

export type ViewID = (typeof VIEW_ID)[keyof typeof VIEW_ID];

export const ICON_ID = {
  blank: 'blank',
  connected: 'vm-connect',
  connecting: 'sync~spin',
  disconnected: 'plug',
  runAll: 'run-all',
  runSelection: 'run',
  saml: 'shield',
  server: 'server',
  serverConnected: 'circle-large-filled',
  serverRunning: 'circle-large-outline',
  serverStopped: 'circle-slash',
  varFigure: 'graph',
  varElement: 'preview',
  varPandas: 'dh-pandas',
  varTable: 'dh-table',
} as const;

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
  isConnectionConnected: 'isConnectionConnected',
  isConnectionConnecting: 'isConnectionConnecting',
  isUri: 'isUri',
} as const;

export const PIP_SERVER_STATUS_DIRECTORY = 'pip-server-status';

export const SERVER_TREE_ITEM_CONTEXT = {
  canStartServer: 'canStartServer',
  isDHEServerRunningConnected: 'isDHEServerRunningConnected',
  isDHEServerRunningDisconnected: 'isDHEServerRunningDisconnected',
  isManagedServerConnected: 'isManagedServerConnected',
  isManagedServerConnecting: 'isManagedServerConnecting',
  isManagedServerDisconnected: 'isManagedServerDisconnected',
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

export const DH_SAML_AUTH_PROVIDER_TYPE = 'dhsaml' as const;
export const DH_SAML_SERVER_URL_SCOPE_KEY = 'deephaven.samlServerUrl' as const;
export const DH_SAML_LOGIN_URL_SCOPE_KEY = 'deephaven.samlLoginUrl' as const;
