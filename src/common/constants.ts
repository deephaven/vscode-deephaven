import * as path from 'node:path';

export const EXTENSION_ID = 'vscode-deephaven' as const;

export const CONFIG_KEY = {
  root: EXTENSION_ID,
  coreServers: 'core-servers',
  enterpriseServers: 'enterprise-servers',
} as const;

export const DEFAULT_CONSOLE_TYPE = 'python' as const;
// export const DHFS_SCHEME = 'dhfs';
export const DOWNLOAD_LOGS_CMD = `${EXTENSION_ID}.downloadLogs`;
export const RUN_CODE_COMMAND = `${EXTENSION_ID}.runCode`;
export const RUN_SELECTION_COMMAND = `${EXTENSION_ID}.runSelection`;
export const SELECT_CONNECTION_COMMAND = `${EXTENSION_ID}.selectConnection`;

export const STATUS_BAR_DISCONNECTED_TEXT = 'Deephaven: Disconnected';
export const STATUS_BAR_DISCONNECT_TEXT = 'Deephaven: Disconnect';
export const STATUS_BAR_CONNECTING_TEXT = 'Deephaven: Connecting...';

export const DOWNLOAD_LOGS_TEXT = 'Download Logs';

export const SERVER_LANGUAGE_SET = new Set(['python', 'groovy']) as ReadonlySet<
  'python' | 'groovy'
>;

export const TMP_DIR_ROOT = path.join(__dirname, '..', 'tmp');
