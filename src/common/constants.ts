export const CONFIG_KEY = 'vscode-deephaven';
export const CONFIG_CORE_SERVERS = 'core-servers';

export const DEFAULT_CONSOLE_TYPE = 'python' as const;
// export const DHFS_SCHEME = 'dhfs';
export const DOWNLOAD_LOGS_CMD = `${CONFIG_KEY}.downloadLogs`;
export const RUN_CODE_COMMAND = `${CONFIG_KEY}.runCode`;
export const RUN_SELECTION_COMMAND = `${CONFIG_KEY}.runSelection`;
export const SELECT_CONNECTION_COMMAND = `${CONFIG_KEY}.selectConnection`;

export const STATUS_BAR_DISCONNECTED_TEXT = 'Deephaven: Disconnected';
export const STATUS_BAR_DISCONNECT_TEXT = 'Deephaven: Disconnect';
export const STATUS_BAR_CONNECTING_TEXT = 'Deephaven: Connecting...';

export const DOWNLOAD_LOGS_TEXT = 'Download Logs';

export const SERVER_LANGUAGE_SET = new Set(['python', 'groovy']) as ReadonlySet<
  'python' | 'groovy'
>;
