import * as path from 'node:path';
import type { ConsoleType } from '../types';

export const EXTENSION_ID = 'vscode-deephaven' as const;

export const CONFIG_KEY = {
  root: 'deephaven',
  coreServers: 'coreServers',
  enterpriseServers: 'enterpriseServers',
} as const;

export const DEFAULT_CONSOLE_TYPE = 'python' as const;
// export const DHFS_SCHEME = 'dhfs';

export const SERVER_STATUS_CHECK_INTERVAL = 3000;

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
  isServerRunningConnected: 'isServerRunningConnected',
  isServerRunningDisconnected: 'isServerRunningDisconnected',
  isServerStopped: 'isServerStopped',
} as const;

export type ServerTreeItemContextValue = keyof typeof SERVER_TREE_ITEM_CONTEXT;
