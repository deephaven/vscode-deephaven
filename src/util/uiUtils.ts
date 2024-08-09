import * as vscode from 'vscode';
import {
  ConnectionConfig,
  ConnectionType,
  ConsoleType,
  SELECT_CONNECTION_COMMAND,
  STATUS_BAR_CONNECTING_TEXT,
  STATUS_BAR_DISCONNECTED_TEXT,
  STATUS_BAR_DISCONNECT_TEXT,
} from '../common';
import { Config } from '../services';

export interface ConnectionOption {
  type: ConnectionType;
  label: string;
  url: string;
  consoleType: ConsoleType;
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
 * Create quickpick for selecting a connection.
 * @param connectionOptions
 * @param selectedUrl
 */
export async function createConnectionQuickPick(
  connectionOptions: ConnectionOption[],
  selectedUrl?: string | null
): Promise<ConnectionOption | DisconnectOption | undefined> {
  const options: (ConnectionOption | DisconnectOption)[] = [
    ...connectionOptions.map(option => ({
      ...option,
      label: formatConnectionLabel(
        option.label,
        option.url === selectedUrl,
        option.consoleType
      ),
    })),
  ];

  if (selectedUrl != null) {
    options.unshift({
      label: formatConnectionLabel(STATUS_BAR_DISCONNECT_TEXT, false),
      url: null,
    });
  }

  return vscode.window.showQuickPick(options);
}

/**
 * Create a status bar item for connecting to DH server
 */
export function createConnectStatusBarItem(
  show: boolean
): vscode.StatusBarItem {
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.command = SELECT_CONNECTION_COMMAND;
  const { text, tooltip } = createConnectTextAndTooltip('disconnected');
  statusBarItem.text = text;
  statusBarItem.tooltip = tooltip;

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
  return ({
    url: serverUrl,
    consoleType,
  }: ConnectionConfig): ConnectionOption => {
    const url = new URL(serverUrl ?? '');
    const label = `${type}: ${url.hostname}:${url.port}`;

    return { type, consoleType, label, url: serverUrl };
  };
}

/**
 * Create connection options from current extension config.
 */
export function createConnectionOptions(): ConnectionOption[] {
  const dhcServerUrls = Config.getCoreServers();

  const connectionOptions: ConnectionOption[] = [
    ...dhcServerUrls.map(createConnectionOption('DHC')),
  ];

  return connectionOptions;
}

/**
 * Create display text and tooltip for the connection status bar item.
 * @param status The connection status
 * @param option The connection option
 */
export function createConnectTextAndTooltip(
  status: 'connecting' | 'connected' | 'disconnected',
  option?: ConnectionOption
): { text: string; tooltip: string } {
  const icon = {
    connecting: '$(sync~spin)',
    connected: '$(vm-connect)',
    disconnected: '$(debug-disconnect)',
  }[status];

  const label = {
    connecting: STATUS_BAR_CONNECTING_TEXT,
    connected: option?.label,
    disconnected: STATUS_BAR_DISCONNECTED_TEXT,
  }[status];

  const tooltip = {
    connecting: `Connecting to ${option?.url}...`,
    connected: `Connected to ${option?.url}`,
    disconnected: 'Connect to Deephaven',
  }[status];

  const text = `${icon} ${label}`;

  return {
    text,
    tooltip,
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
    ? `$(vm-connect) ${label}${consoleTypeStr}`
    : `$(blank) ${label}${consoleTypeStr}`;
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
 * Determine whether connection status bar item should be visible. Only show if either:
 * 1. A connection is already selected or
 * 2. The active text editor has a languageid that is supported by the currently
 * configured server connections.
 */
export function shouldShowConnectionStatusBarItem(
  connectionOptions: ConnectionOption[],
  isAlreadyConnected: boolean
): boolean {
  if (isAlreadyConnected) {
    return true;
  }

  if (
    vscode.window.activeTextEditor?.document.languageId === 'python' &&
    connectionOptions.some(c => c.consoleType === 'python')
  ) {
    return true;
  }

  if (
    vscode.window.activeTextEditor?.document.languageId === 'groovy' &&
    connectionOptions.some(c => c.consoleType === 'groovy')
  ) {
    return true;
  }

  return false;
}

/**
 * Update text and tooltip of given status bar item based on connection status
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

  const { text, tooltip } = createConnectTextAndTooltip(status, option);
  statusBarItem.text = text;
  statusBarItem.tooltip = tooltip;
}
