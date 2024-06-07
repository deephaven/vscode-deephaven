import * as vscode from 'vscode';
import {
  ConnectionType,
  SELECT_CONNECTION_COMMAND,
  STATUS_BAR_DISCONNECTED_TEXT,
  STATUS_BAR_DISCONNECT_TEXT,
} from '../common';
import { Config } from '../services';

export interface ConnectionOption {
  type: ConnectionType;
  label: string;
  url: string;
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
  function padLabel(label: string, isSelected: boolean) {
    return isSelected ? `$(circle-filled) ${label}` : `      ${label}`;
  }

  const options: (ConnectionOption | DisconnectOption)[] = [
    ...connectionOptions.map(option => ({
      ...option,
      label: padLabel(option.label, option.url === selectedUrl),
    })),
  ];

  if (selectedUrl != null) {
    options.unshift({
      label: padLabel(STATUS_BAR_DISCONNECT_TEXT, false),
      url: null,
    });
  }

  return await vscode.window.showQuickPick(options);
}

/**
 * Create a status bar item for connecting to DH server
 */
export function createConnectStatusBarItem() {
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.command = SELECT_CONNECTION_COMMAND;
  statusBarItem.text = createConnectText(STATUS_BAR_DISCONNECTED_TEXT);
  statusBarItem.show();

  return statusBarItem;
}

/**
 * Create an option for the connection selection picker.
 * @param type The type of connection
 */
export function createConnectionOption(type: ConnectionType) {
  return (serverUrl: string) => {
    const url = new URL(serverUrl ?? '');
    const label = `${type}: ${url.hostname}:${url.port}`;

    return { type, label, url: serverUrl };
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
 * Create display text for the connection status bar item.
 * @param connectionDisplay The connection display text
 */
export function createConnectText(connectionDisplay: string) {
  return `$(debug-disconnect) ${connectionDisplay.trim()}`;
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
