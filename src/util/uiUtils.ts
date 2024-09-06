import * as vscode from 'vscode';
import {
  SELECT_CONNECTION_COMMAND,
  STATUS_BAR_CONNECTING_TEXT,
  STATUS_BAR_DISCONNECTED_TEXT,
  ICON_ID,
} from '../common';
import type {
  ConnectionType,
  ConsoleType,
  ConnectionPickItem,
  IDhService,
  ServerState,
  SeparatorPickItem,
  ConnectionPickOption,
  ServerConnection,
} from '../types';

export interface ConnectionOption {
  type: ConnectionType;
  label: string;
  url: URL;
}

export interface DisconnectOption {
  label: string;
  url: null;
}

export interface WorkspaceFolderConfig {
  readonly uri: vscode.Uri;
  readonly name?: string;
}

/**
 * Create options for a connection quick pick.
 * @param servers The available servers
 * @param connections The available connections
 * @param editorLanguageId The language id of the editor
 * @param editorActiveConnectionUrl The active connection url of the editor
 * @returns
 */
export function createConnectionQuickPickOptions<
  TConnection extends ServerConnection,
>(
  servers: ServerState[],
  connections: TConnection[],
  editorLanguageId: string,
  editorActiveConnectionUrl?: URL | null
): ConnectionPickOption<TConnection>[] {
  const serverOptions: ConnectionPickItem<'server', ServerState>[] =
    servers.map(data => ({
      type: 'server',
      label: data.url.toString(),
      description: data.label ?? (data.isManaged ? 'pip' : undefined),
      iconPath: new vscode.ThemeIcon(ICON_ID.server),
      data,
    }));

  const connectionOptions: ConnectionPickItem<'connection', TConnection>[] = [];

  for (const dhService of connections) {
    const isActiveConnection =
      editorActiveConnectionUrl?.toString() === dhService.serverUrl.toString();

    connectionOptions.push({
      type: 'connection',
      label: dhService.serverUrl.toString(),
      iconPath: new vscode.ThemeIcon(ICON_ID.connected),
      description: isActiveConnection
        ? `${editorLanguageId} (current)`
        : editorLanguageId,
      data: dhService,
    });
  }

  if (serverOptions.length === 0 && connectionOptions.length === 0) {
    throw new Error('No available servers to connect to.');
  }

  // Sort options by label
  connectionOptions.sort(sortByLabel);
  serverOptions.sort(sortByLabel);

  return [
    createSeparatorPickItem('Active Connections'),
    ...connectionOptions,
    createSeparatorPickItem('Connect to Server'),
    ...serverOptions,
  ];
}

/**
 * Create quickpick for selecting a connection.
 */
export async function createConnectionQuickPick(
  options: ConnectionPickOption<IDhService>[]
): Promise<ServerState | IDhService | null> {
  const result = await vscode.window.showQuickPick(options, {
    title: 'Connect Editor',
  });

  if (result == null || !('type' in result)) {
    return null;
  }

  return result.data;
}

/**
 * Create a status bar item for connecting to DH server
 */
export function createConnectStatusBarItem(
  show: boolean
): vscode.StatusBarItem {
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    2000
  );
  statusBarItem.command = SELECT_CONNECTION_COMMAND;
  const text = createConnectText('disconnected');
  statusBarItem.text = text;

  if (show) {
    statusBarItem.show();
  } else {
    statusBarItem.hide();
  }

  return statusBarItem;
}

/**
 * Create an option for the connection selection picker.
 * @param type The type of connection
 */
export function createConnectionOption(type: ConnectionType) {
  return (url: URL): ConnectionOption => {
    const label = `${type}: ${url.hostname}:${url.port}`;

    return { type, label, url };
  };
}

/**
 * Create display text for the connection status bar item.
 * @param status The connection status
 * @param option The connection option
 */
export function createConnectText(
  status: 'connecting' | 'connected' | 'disconnected',
  option?: ConnectionOption
): string {
  const icon = {
    connecting: `$(${ICON_ID.connecting})`,
    connected: `$(${ICON_ID.connected})`,
    disconnected: `$(${ICON_ID.disconnected})`,
  }[status];

  const label = {
    connecting: STATUS_BAR_CONNECTING_TEXT,
    connected: option?.label,
    disconnected: STATUS_BAR_DISCONNECTED_TEXT,
  }[status];

  const text = `${icon} ${label}`;

  return text;
}

/**
 * Create a separator pick item.
 * @param label The label for the separator
 */
export function createSeparatorPickItem(label: string): SeparatorPickItem {
  return {
    label,
    kind: vscode.QuickPickItemKind.Separator,
  };
}

/**
 * Format the connection label for display.
 * @param label The original label to format
 * @param isSelected Whether the connection is selected
 * @param consoleType The console type
 */
export function formatConnectionLabel(
  label: string,
  isSelected: boolean,
  consoleType?: ConsoleType
): string {
  const consoleTypeStr = consoleType ? ` (${consoleType})` : '';
  return isSelected
    ? `$(${ICON_ID.connected}) ${label}${consoleTypeStr}`
    : `$(${ICON_ID.blank}) ${label}${consoleTypeStr}`;
}

// Copied from @deephaven/console `ConsoleUtils`
export function formatTimestamp(date: Date): string | null {
  if (date == null || !(date instanceof Date)) {
    return null;
  }

  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  const seconds = `${date.getSeconds()}`.padStart(2, '0');
  const milliseconds = `${date.getMilliseconds()}`.padStart(3, '0');

  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

/**
 * Get DH `themeKey` based on current vscode theme.
 */
export function getDHThemeKey(): string {
  switch (vscode.window.activeColorTheme.kind) {
    case vscode.ColorThemeKind.Light:
    case vscode.ColorThemeKind.HighContrastLight:
      return 'default-light';

    case vscode.ColorThemeKind.Dark:
    case vscode.ColorThemeKind.HighContrast:
    default:
      return 'default-dark';
  }
}

/**
 * Get a `TextEditor` containing the given uri. If there is one already open,
 * it will be returned. Otherwise, a new one will be opened. The returned editor
 * will become the active editor if it is not already.
 * @param uri
 */
export async function getEditorForUri(
  uri: vscode.Uri
): Promise<vscode.TextEditor> {
  if (
    uri.toString() === vscode.window.activeTextEditor?.document.uri.toString()
  ) {
    return vscode.window.activeTextEditor;
  }

  const viewColumn = vscode.window.visibleTextEditors.find(
    editor => editor.document.uri.toString() === uri.toString()
  )?.viewColumn;

  // If another panel such as the output panel is active, set the document
  // for the url to active first
  // https://stackoverflow.com/a/64808497/20489
  return vscode.window.showTextDocument(uri, { preview: false, viewColumn });
}

/**
 * Sort function for sorting by label.
 */
export function sortByLabel<T extends { label: string }>(a: T, b: T): number {
  return a.label.localeCompare(b.label);
}

/**
 * Update given status bar item based on connection status
 * and optional `ConnectionOption`.
 * @param statusBarItem The status bar item to update
 * @param status The connection status
 * @param option The connection option
 */
export function updateConnectionStatusBarItem(
  statusBarItem: vscode.StatusBarItem | null | undefined,
  status: 'connecting' | 'connected' | 'disconnected',
  option?: ConnectionOption
): void {
  if (statusBarItem == null) {
    return;
  }

  const text = createConnectText(status, option);
  statusBarItem.text = text;
}
