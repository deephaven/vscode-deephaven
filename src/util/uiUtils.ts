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
  ServerState,
  SeparatorPickItem,
  ConnectionPickOption,
  ConnectionState,
  Username,
  OperateAsUsername,
  AuthenticationMethodPickItem,
  UserLoginPreferences,
  PasswordOrPrivateKeyCredentials,
  PasswordCredentials,
  PrivateKeyCredentials,
  NonEmptyArray,
} from '../types';
import { sortByStringProp } from './dataUtils';
import { assertDefined } from './assertUtil';

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

const PASSWORD_AUTHENTICATION_METHOD_PICK_ITEM = {
  label: 'Username / Password',
  type: 'password',
  iconPath: new vscode.ThemeIcon('account'),
} as const;

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
    title: 'Connect Editor',
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
  userLoginPreferences: UserLoginPreferences;
  privateKeyUserNames: NonEmptyArray<Username>;
  showOperatesAs?: boolean;
}): Promise<PrivateKeyCredentials | undefined>;
export async function runUserLoginWorkflow(args: {
  title: string;
  userLoginPreferences?: UserLoginPreferences;
  privateKeyUserNames?: Username[];
  showOperatesAs?: boolean;
}): Promise<PasswordOrPrivateKeyCredentials | undefined> {
  const {
    title,
    userLoginPreferences,
    privateKeyUserNames = [],
    showOperatesAs,
  } = args;

  // Authentication method (only prompt if private key user names are given)
  const promptForAuthenticationMethod = privateKeyUserNames.length > 0;

  const authenticationMethod: AuthenticationMethodPickItem | null =
    promptForAuthenticationMethod
      ? await createAuthenticationMethodQuickPick(title, privateKeyUserNames)
      : PASSWORD_AUTHENTICATION_METHOD_PICK_ITEM;

  if (authenticationMethod == null) {
    return;
  }

  let username: Username | undefined;
  let token: string | undefined;
  let operateAs: OperateAsUsername | undefined;

  // Username comes from private key item or prompt
  username =
    authenticationMethod.type === 'privateKey'
      ? authenticationMethod.label
      : await promptForUsername(title, userLoginPreferences?.lastLogin);

  // Cancelled by user
  if (username == null) {
    return;
  }

  // Password prompts only apply to `type` 'password'
  if (authenticationMethod.type === 'password') {
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

  if (authenticationMethod.type === 'password') {
    assertDefined(token, 'token');
    return {
      type: authenticationMethod.type,
      username,
      token,
      operateAs,
    };
  }

  return {
    type: authenticationMethod.type,
    username,
    operateAs,
  };
}

/**
 * Create quickpick for selecting an authentication method.
 * @param title
 * @param privateKeyUserNames
 * @returns Result of the quickpick. Null if selection cancelled.
 */
export async function createAuthenticationMethodQuickPick(
  title: string,
  privateKeyUserNames: Username[]
): Promise<AuthenticationMethodPickItem | null> {
  const result = await vscode.window.showQuickPick<
    AuthenticationMethodPickItem | SeparatorPickItem
  >(
    [
      PASSWORD_AUTHENTICATION_METHOD_PICK_ITEM,
      createSeparatorPickItem('Private Key'),
      ...privateKeyUserNames.map(userName => ({
        label: userName,
        type: 'privateKey' as const,
        iconPath: new vscode.ThemeIcon('key'),
      })),
    ],
    {
      title,
      placeHolder: 'Select authentication method',
    }
  );

  if (result == null || !('type' in result)) {
    return null;
  }

  return result;
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

export function promptForUsername(
  title: string,
  lastLogin?: Username
): Promise<Username | undefined> {
  return vscode.window.showInputBox({
    placeHolder: 'Username',
    prompt: 'Deephaven username',
    title,
    value: lastLogin,
  }) as Promise<Username | undefined>;
}

export function promptForPassword(title: string): Promise<string | undefined> {
  return vscode.window.showInputBox({
    placeHolder: 'Password',
    prompt: 'Deephaven password',
    password: true,
    title,
  }) as Promise<string | undefined>;
}

export function promptForOperateAs(
  title: string,
  defaultValue?: OperateAsUsername
): Promise<OperateAsUsername | undefined> {
  return vscode.window.showInputBox({
    placeHolder: 'Operate As',
    prompt: 'Deephaven `Operate As` username',
    title,
    value: defaultValue,
  }) as Promise<OperateAsUsername | undefined>;
}
