import * as path from 'node:path';
import type { ConsoleType, Port } from '../types';

export const EXTENSION_ID = 'vscode-deephaven' as const;

export const CONFIG_KEY = {
  root: 'deephaven',
  coreServers: 'coreServers',
  enterpriseServers: 'enterpriseServers',
} as const;

export const DEFAULT_CONSOLE_TYPE = 'python' as const;
// export const DHFS_SCHEME = 'dhfs';

export const DEFAULT_PIP_PORT_RANGE: ReadonlySet<Port> = new Set([
  10001, 10002, 10003, 10004,
] as Port[]);

export const PYTHON_ENV_WAIT = 1500 as const;

export const SERVER_STATUS_CHECK_TIMEOUT = 3000;
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

export const TMP_DIR_ROOT = path.join(__dirname, '..', 'tmp');

export const VIEW_ID = {
  serverTree: `${EXTENSION_ID}.serverTree`,
  serverConnectionTree: `${EXTENSION_ID}.serverConnectionTree`,
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
} as const;

export const CONNECTION_TREE_ITEM_CONTEXT = {
  isConnection: 'isConnection',
  isUri: 'isUri',
} as const;

export const SERVER_TREE_ITEM_CONTEXT = {
  canStartServer: 'canStartServer',
  isManagedServerConnected: 'isManagedServerConnected',
  isManagedServerConnecting: 'isManagedServerConnecting',
  isManagedServerDisconnected: 'isManagedServerDisconnected',
  isServerRunningConnected: 'isServerRunningConnected',
  isServerRunningDisconnected: 'isServerRunningDisconnected',
  isServerStopped: 'isServerStopped',
} as const;

export type ServerTreeItemContextValue = keyof typeof SERVER_TREE_ITEM_CONTEXT;
