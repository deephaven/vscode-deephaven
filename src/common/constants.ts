import * as path from 'node:path';
import type { ConsoleType, VariableType } from '../types';

export const EXTENSION_ID = 'vscode-deephaven' as const;

export const CONFIG_KEY = {
  root: 'deephaven',
  coreServers: 'coreServers',
  enterpriseServers: 'enterpriseServers',
} as const;

export const DEFAULT_CONSOLE_TYPE = 'python' as const;
// export const DHFS_SCHEME = 'dhfs';

export const PYTHON_ENV_WAIT = 1500 as const;

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
  serverTree: `${EXTENSION_ID}.serverTree`,
  serverConnectionTree: `${EXTENSION_ID}.serverConnectionTree`,
  serverConnectionPanelTree: `${EXTENSION_ID}.serverConnectionPanelTree`,
} as const;

export const ICON_ID = {
  blank: 'blank',
  connected: 'vm-connect',
  connecting: 'sync~spin',
  disconnected: 'plug',
  runAll: 'run-all',
  runSelection: 'run',
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
  isConnection: 'isConnection',
  isUri: 'isUri',
} as const;

export const PIP_SERVER_STATUS_DIRECTORY = 'pip-server-status';

export const SERVER_TREE_ITEM_CONTEXT = {
  canStartServer: 'canStartServer',
  isDHEServerRunning: 'isDHEServerRunning',
  isManagedServerConnected: 'isManagedServerConnected',
  isManagedServerConnecting: 'isManagedServerConnecting',
  isManagedServerDisconnected: 'isManagedServerDisconnected',
  isServerRunningConnected: 'isServerRunningConnected',
  isServerRunningDisconnected: 'isServerRunningDisconnected',
  isServerStopped: 'isServerStopped',
} as const;

export type ServerTreeItemContextValue = keyof typeof SERVER_TREE_ITEM_CONTEXT;

export const DEEPHAVEN_POST_MSG = {
  loginOptionsRequest: 'io.deephaven.message.LoginOptions.request',
  sessionDetailsRequest: 'io.deephaven.message.SessionDetails.request',
} as const;

export const VSCODE_POST_MSG = {
  loginOptionsResponse: 'vscode-ext.loginOptions',
  sessionDetailsResponse: 'vscode-ext.sessionDetails',
} as const;
