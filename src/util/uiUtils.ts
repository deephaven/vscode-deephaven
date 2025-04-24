import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import archiver from 'archiver';
import type {
  OperateAsUsername,
  PasswordCredentials,
  Username,
} from '@deephaven-enterprise/auth-nodejs';
import {
  SELECT_CONNECTION_COMMAND,
  STATUS_BAR_CONNECTING_TEXT,
  STATUS_BAR_DISCONNECTED_TEXT,
  ICON_ID,
  type ViewID,
} from '../common';
import { assertDefined } from '../crossModule';
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
  AuthFlow,
  LoginPromptCredentials,
  MultiAuthConfig,
} from '../types';
import { getFilePathDateToken, sortByStringProp } from './dataUtils';
import { Logger } from './Logger';

const logger = new Logger('uiUtils');

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
 * Prompt the user for which auth flow to use. If there is only 1 enabled, just
 * return it.
 * @param authConfig
 * @returns The selected auth flow or null if cancelled.
 */
export async function promptForAuthFlow(
  authConfig: MultiAuthConfig
): Promise<AuthFlow | null> {
  const result = await vscode.window.showQuickPick(
    [
      {
        iconPath: new vscode.ThemeIcon(ICON_ID.saml),
        label: authConfig.samlConfig.providerName,
        value: { type: 'saml', config: authConfig.samlConfig },
      },
      {
        label: 'Basic Login',
        value: { type: 'password' },
      },
    ] as const,
    { ignoreFocusOut: true, title: 'Login' }
  );

  if (result == null) {
    return null;
  }

  return result?.value;
}

/**
 * Prompt user for credentials. Prompts are based on the provided arguments.
 * @param title Title for the prompts
 * @param userLoginPreferences User login preferences to determine default values
 * for user / operate as prompts.
 * @param privateKeyUserNames Optional list of private key user names. If provided,
 * the authentication method will be prompted to determine if user wants to use
 * one of these private keys or username/password.
 * @param showOperatesAs Whether to show the operate as prompt.
 */
export async function promptForCredentials(args: {
  title: string;
  userLoginPreferences?: UserLoginPreferences;
  privateKeyUserNames?: undefined | [];
  showOperatesAs?: boolean;
}): Promise<PasswordCredentials | undefined>;
export async function promptForCredentials(args: {
  title: string;
  userLoginPreferences?: UserLoginPreferences;
  privateKeyUserNames?: Username[];
  showOperatesAs?: boolean;
}): Promise<LoginPromptCredentials | undefined>;
export async function promptForCredentials(args: {
  title: string;
  userLoginPreferences?: UserLoginPreferences;
  privateKeyUserNames?: Username[];
  showOperatesAs?: boolean;
}): Promise<LoginPromptCredentials | undefined> {
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

export function getThemeColor(colorKey: string): string | null {
  const config = vscode.workspace.getConfiguration('workbench');
  const colorCustomizations =
    config.get<Record<string, string>>('colorCustomizations') || {};

  return (
    colorCustomizations[colorKey] ??
    vscode.workspace.getConfiguration().get(colorKey) ??
    null
  );
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
 * Open a save file dialog for a given file name and filters. Defaults to
 * workspace folder if it can be determined. Otherwise will default to whatever
 * VS Code determines for the environment.
 * @param fileName The file name to use as the default.
 * @param filters A set of file filters that are used by the save file dialog.
 * Each key is a human-readable name for the filter and the value is an array of
 * file extensions. For example:
 * {
 *   'Images': ['png', 'jpg'],
 *   'TypeScript': ['ts', 'tsx']
 * }
 * @returns The selected file URI or undefined if cancelled.
 */
export async function showWorkspaceSaveDialog(
  fileName: string,
  filters: vscode.SaveDialogOptions['filters']
): Promise<vscode.Uri | undefined> {
  const wkspFolder = getWorkspaceFolder();

  const defaultUri =
    wkspFolder == null
      ? vscode.Uri.file(fileName)
      : vscode.Uri.joinPath(wkspFolder.uri, fileName);

  return vscode.window.showSaveDialog({
    defaultUri,
    filters,
  });
}

/**
 * Zip and save logs for Deephaven VS Code extension.
 * @param logDirectory The directory containing the log files to save.
 * @returns The URI for the saved .zip file
 */
export async function saveLogFiles(
  logDirectory: string
): Promise<vscode.Uri | null> {
  const uri = await showWorkspaceSaveDialog(
    `deephaven-vscode_${getFilePathDateToken()}.zip`,
    {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      'Log Files': ['zip'],
    }
  );

  if (uri == null) {
    return null;
  }

  logger.debug(`Saving log files from '${logDirectory}' to '${uri.fsPath}'.`);

  const writeStream = fs.createWriteStream(uri.fsPath);
  const archive = archiver('zip', {
    zlib: { level: 9 }, // Sets the compression level.
  });

  const promise = new Promise<vscode.Uri>((resolve, reject) => {
    writeStream.on('close', function () {
      logger.debug(archive.pointer() + ' total bytes');
      logger.debug(
        'archiver has been finalized and the output file descriptor has closed.'
      );
      resolve(uri);
    });

    archive.on('warning', err => {
      if (err.code === 'ENOENT') {
        logger.warn(err);
      } else {
        reject(err);
      }
    });

    archive.on('error', err => {
      reject(err);
    });
  });

  archive.pipe(writeStream);

  // Include the `exthost.log` which contains entries for all extensions
  archive.file(path.join(path.dirname(logDirectory), 'exthost.log'), {
    name: 'exthost.log',
  });

  // Include Deephaven extension logs
  archive.directory(logDirectory, false);

  archive.finalize();

  return promise;
}

/**
 * Save a map of dependency name / versions to a `requirements.txt` file.
 * @param dependencies The map of dependency names / versions to save.
 * @returns Promise that resolves when the file is saved.
 */
export async function saveRequirementsTxt(
  dependencies: Map<DependencyName, DependencyVersion>
): Promise<void> {
  const uri = await showWorkspaceSaveDialog('requirements.txt', {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Requirements: ['txt'],
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

/**
 * Set the `isVisible` state of a given view id. Uses extension context
 * `${viewId}.isVisible` to store the state. This can then be used in package.json
 * view configs to conditionally show or hide views based on their visibility.
 * @param viewId The view ID to set the visibility for.
 * @param isVisible Whether the view is visible or not.
 */
export function setViewIsVisible(viewId: ViewID, isVisible: boolean): void {
  vscode.commands.executeCommand(
    'setContext',
    `${viewId}.isVisible`,
    isVisible
  );
}
