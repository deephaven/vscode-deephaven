import * as path from 'node:path';

export const CAN_CREATE_CONNECTION_CONTEXT = 'canCreateConnection' as const;

export const EXTENSION_ID = 'vscode-deephaven' as const;

export const CONFIG_KEY = {
  root: 'deephaven',
  coreServers: 'coreServers',
  enterpriseServers: 'enterpriseServers',
} as const;

export const DEFAULT_CONSOLE_TYPE = 'python' as const;
// export const DHFS_SCHEME = 'dhfs';
export const DOWNLOAD_LOGS_CMD = `${EXTENSION_ID}.downloadLogs`;
export const RUN_CODE_COMMAND = `${EXTENSION_ID}.runCode`;
export const RUN_SELECTION_COMMAND = `${EXTENSION_ID}.runSelection`;
export const SELECT_CONNECTION_COMMAND = `${EXTENSION_ID}.selectConnection`;

export const SERVER_STATUS_CHECK_INTERVAL = 3000;

export const STATUS_BAR_DISCONNECTED_TEXT = 'Deephaven: Disconnected';
export const STATUS_BAR_DISCONNECT_TEXT = 'Deephaven: Disconnect';
export const STATUS_BAR_CONNECTING_TEXT = 'Deephaven: Connecting...';

export const DOWNLOAD_LOGS_TEXT = 'Download Logs';

export const SERVER_LANGUAGE_SET = new Set(['python', 'groovy']) as ReadonlySet<
  'python' | 'groovy'
>;

export const TMP_DIR_ROOT = path.join(__dirname, '..', 'tmp');

export const VIEW_ID = {
  serverTree: `${EXTENSION_ID}.serverTree`,
  serverConnectionTree: `${EXTENSION_ID}.serverConnectionTree`,
} as const;

export const ICON_ID = {
  blank: 'blank',
  connected: 'vm-connect',
  connecting: 'sync~spin',
  disconnected: 'debug-disconnect',
  runAll: 'run-all',
  runSelection: 'run',
} as const;
