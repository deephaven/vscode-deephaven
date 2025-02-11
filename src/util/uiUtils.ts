import * as vscode from 'vscode';
import * as fs from 'node:fs';
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
  ServerState,
  SeparatorPickItem,
  ConnectionPickOption,
  ConnectionState,
  UserLoginPreferences,
  Psk,
  DependencyName,
  DependencyVersion,
} from '../types';
import { sortByStringProp } from './dataUtils';
import { assertDefined } from './assertUtil';
import type {
  KeyPairCredentials,
  OperateAsUsername,
  PasswordCredentials,
  Username,
} from '@deephaven-enterprise/auth-nodejs';

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
  TConnection extends ConnectionState,
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
  connectionOptions.sort(sortByStringProp('label'));
  serverOptions.sort(sortByStringProp('label'));

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
  options: ConnectionPickOption<ConnectionState>[]
): Promise<ConnectionState | ServerState | null> {
  const result = await vscode.window.showQuickPick(options, {
    ignoreFocusOut: true,
    title: 'Connect Editor',
    placeHolder: "Select connection (Press 'Escape' to cancel)",
  });

  if (result == null || !('type' in result)) {
    return null;
  }

  return result.data;
}

/**
 * Run user login workflow that prompts user for credentials. Prompts are
 * conditional based on the provided arguments.
 * @param title Title for the prompts
 * @param userLoginPreferences User login preferences to determine default values
 * for user / operate as prompts.
 * @param privateKeyUserNames Optional list of private key user names. If provided,
 * the authentication method will be prompted to determine if user wants to use
 * one of these private keys or username/password.
 * @param showOperatesAs Whether to show the operate as prompt.
 */
export async function runUserLoginWorkflow(args: {
  title: string;
  userLoginPreferences?: UserLoginPreferences;
  privateKeyUserNames?: undefined | [];
  showOperatesAs?: boolean;
}): Promise<PasswordCredentials | undefined>;
export async function runUserLoginWorkflow(args: {
  title: string;
  userLoginPreferences?: UserLoginPreferences;
  privateKeyUserNames?: Username[];
  showOperatesAs?: boolean;
}): Promise<
  PasswordCredentials | Omit<KeyPairCredentials, 'keyPair'> | undefined
>;
export async function runUserLoginWorkflow(args: {
  title: string;
  userLoginPreferences?: UserLoginPreferences;
  privateKeyUserNames?: Username[];
  showOperatesAs?: boolean;
}): Promise<
  PasswordCredentials | Omit<KeyPairCredentials, 'keyPair'> | undefined
> {
  const {
    title,
    userLoginPreferences,
    privateKeyUserNames = [],
    showOperatesAs,
  } = args;

  const username = await promptForUsername(
    title,
    userLoginPreferences?.lastLogin
  );
  let token: string | undefined;
  let operateAs: OperateAsUsername | undefined;

  // Cancelled by user
  if (username == null) {
    return;
  }

  const hasPrivateKey = privateKeyUserNames.includes(username);

  // Password
  if (!hasPrivateKey) {
    token = await promptForPassword(title);

    // Cancelled by user
    if (token == null) {
      return;
    }
  }

  // Operate As
  if (showOperatesAs) {
    const defaultValue = username as unknown as OperateAsUsername | undefined;

    const operateAs = await promptForOperateAs(
      title,
      userLoginPreferences?.operateAsUser[username] ?? defaultValue
    );

    // Cancelled by user
    if (operateAs == null) {
      return;
    }
  }

  if (hasPrivateKey) {
    return {
      type: 'keyPair',
      username,
      operateAs,
    };
  }

  assertDefined(token, 'token');
  return {
    type: 'password',
    username,
    token,
    operateAs,
  };
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
 * Get the workspace folder for the active editor or fallback to the first listed
 * workspace folder.
 * @returns The workspace folder or undefined if there are no workspace folders.
 */
export function getWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  const wkspFolders = vscode.workspace.workspaceFolders ?? [];

  if (wkspFolders.length === 0) {
    return;
  }

  const activeUri = vscode.window.activeTextEditor?.document.uri;

  const activeWkspFolder =
    activeUri == null
      ? null
      : wkspFolders.find(path => activeUri.fsPath.startsWith(path.uri.fsPath));

  return activeWkspFolder ?? wkspFolders[0];
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

/**
 * Prompt user for username.
 * @param title Title of the prompt
 * @param lastLogin Optional last login username
 * @returns The username or undefined if cancelled by the user.
 */
export function promptForUsername(
  title: string,
  lastLogin?: Username
): Promise<Username | undefined> {
  return vscode.window.showInputBox({
    ignoreFocusOut: true,
    placeHolder: 'Username',
    prompt: 'Deephaven username',
    title,
    value: lastLogin,
  }) as Promise<Username | undefined>;
}

/**
 * Prompt the user for a password.
 * @param title Title of the prompt
 * @returns The password or undefined if cancelled by the user.
 */
export function promptForPassword(title: string): Promise<string | undefined> {
  return vscode.window.showInputBox({
    ignoreFocusOut: true,
    placeHolder: 'Password',
    prompt: 'Deephaven password',
    password: true,
    title,
  }) as Promise<string | undefined>;
}

/**
 * Prompt the user for a pre-shared key.
 * @param title Title of the prompt
 * @returns The pre-shared key or undefined if cancelled by the user.
 */
export function promptForPsk(title: string): Promise<Psk | undefined> {
  return vscode.window.showInputBox({
    ignoreFocusOut: true,
    placeHolder: 'Pre-Shared Key',
    prompt: 'Enter your Deephaven pre-shared key',
    password: true,
    title,
  }) as Promise<Psk | undefined>;
}

/**
 * Prompt the user for an `Operate As` username.
 * @param title Title of the prompt
 * @param defaultValue Optional default value
 * @returns The `Operate As` username or undefined if cancelled by the user.
 */
export function promptForOperateAs(
  title: string,
  defaultValue?: OperateAsUsername
): Promise<OperateAsUsername | undefined> {
  return vscode.window.showInputBox({
    ignoreFocusOut: true,
    placeHolder: 'Operate As',
    prompt: 'Deephaven `Operate As` username',
    title,
    value: defaultValue,
  }) as Promise<OperateAsUsername | undefined>;
}

/**
 * Save a map of dependency name / versions to a `requirements.txt` file.
 * @param dependencies The map of dependency names / versions to save.
 * @returns Promise that resolves when the file is saved.
 */
export async function saveRequirementsTxt(
  dependencies: Map<DependencyName, DependencyVersion>
): Promise<void> {
  const wkspFolder = getWorkspaceFolder();

  const defaultUri =
    wkspFolder == null
      ? vscode.Uri.file('requirements.txt')
      : vscode.Uri.joinPath(wkspFolder.uri, 'requirements.txt');

  const uri = await vscode.window.showSaveDialog({
    defaultUri,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    filters: { Requirements: ['txt'] },
  });

  if (uri == null) {
    return;
  }

  const sorted = [...dependencies.entries()]
    .map(([packageName, version]) => `${packageName}==${version}`)
    .sort((a, b) => a.localeCompare(b));

  fs.writeFileSync(uri.fsPath, sorted.join('\n'));

  vscode.window.showTextDocument(uri);
}
