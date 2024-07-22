import * as vscode from 'vscode';
import {
  ConnectionConfig,
  ConnectionType,
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
    return isSelected ? `$(vm-connect) ${label}` : `$(blank) ${label}`;
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

  return vscode.window.showQuickPick(options);
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
  const { text, tooltip } = createConnectTextAndTooltip('disconnected');
  statusBarItem.text = text;
  statusBarItem.tooltip = tooltip;
  statusBarItem.show();

  return statusBarItem;
}

/**
 * Create an option for the connection selection picker.
 * @param type The type of connection
 */
export function createConnectionOption(type: ConnectionType) {
  return ({ url: serverUrl }: ConnectionConfig): ConnectionOption => {
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
