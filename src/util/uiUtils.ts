import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import archiver from 'archiver';
import type {
  OperateAsUsername,
  PasswordCredentials,
  Username,
} from '@deephaven-enterprise/auth-nodejs';
import { QueryStatus } from '@deephaven-enterprise/query-utils';
import {
  SELECT_CONNECTION_COMMAND,
  STATUS_BAR_CONNECTING_TEXT,
  STATUS_BAR_DISCONNECTED_TEXT,
  ICON_ID,
  STOPPED_QUERY_STATUSES,
  UNSET_QUERY_STATUS,
  type ViewID,
} from '../common';
import { assertDefined, type BaseThemeKey } from '../shared';
import type {
  ConnectionType,
  ConsoleType,
  ConnectionPickItem,
  IServerManager,
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
import {
  formatCount,
  getFilePathDateToken,
  sortByStringProp,
} from './dataUtils';
import { getConsoleTypeIconId } from './treeViewUtils';
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
 *
 * Active-connection items mirror the WORKERS-tree worker node: a leading
 * language icon plus the worker name, with the server host:port shown in the
 * description.
 * @param servers The available servers
 * @param connections The available connections
 * @param editorLanguageId The language id of the editor
 * @param serverManager The server manager used to resolve each connection's
 * parent server and worker info.
 * @param editorActiveConnectionUrl The active connection url of the editor
 * @returns
 */
export async function createConnectionQuickPickOptions<
  TConnection extends ConnectionState,
>(
  servers: ServerState[],
  connections: TConnection[],
  editorLanguageId: string,
  serverManager: IServerManager,
  editorActiveConnectionUrl?: URL | null
): Promise<ConnectionPickOption<TConnection>[]> {
  const serverOptions: ConnectionPickItem<'server', ServerState>[] =
    servers.map(data => ({
      type: 'server',
      label: data.label ?? data.url.toString(),
      description: data.isManaged ? 'pip' : undefined,
      iconPath: new vscode.ThemeIcon(ICON_ID.server),
      data,
    }));

  const connectionOptions: ConnectionPickItem<'connection', TConnection>[] =
    await Promise.all(
      connections.map(async dhService => {
        const isActiveConnection =
          editorActiveConnectionUrl?.toString() ===
          dhService.serverUrl.toString();

        const parentServer = serverManager.getServerForConnection(dhService);
        assertDefined(parentServer, 'parentServer');

        const descriptionTokens = [parentServer.label ?? parentServer.url.host];

        if (isActiveConnection) {
          descriptionTokens.push('(current)');
        }

        return {
          type: 'connection' as const,
          label: dhService.label,
          iconPath: new vscode.ThemeIcon(
            getConsoleTypeIconId(editorLanguageId as ConsoleType)
          ),
          description: descriptionTokens.join(' '),
          data: dhService,
        };
      })
    );

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
 * @param showOperateAs Whether to show the operate as prompt.
 */
export async function promptForCredentials(args: {
  title: string;
  userLoginPreferences?: UserLoginPreferences;
  privateKeyUserNames?: undefined | [];
  showOperateAs?: boolean;
}): Promise<PasswordCredentials | undefined>;
export async function promptForCredentials(args: {
  title: string;
  userLoginPreferences?: UserLoginPreferences;
  privateKeyUserNames?: Username[];
  showOperateAs?: boolean;
}): Promise<LoginPromptCredentials | undefined>;
export async function promptForCredentials(args: {
  title: string;
  userLoginPreferences?: UserLoginPreferences;
  privateKeyUserNames?: Username[];
  showOperateAs?: boolean;
}): Promise<LoginPromptCredentials | undefined> {
  const {
    title,
    userLoginPreferences,
    privateKeyUserNames = [],
    showOperateAs,
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
  if (showOperateAs) {
    const defaultValue = username as unknown as OperateAsUsername | undefined;

    operateAs = await promptForOperateAs(
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
export function getDHThemeKey(): BaseThemeKey {
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
 * The picker's "Running" section: every status a user watching the view might
 * still care about — `Running` itself, the transitional statuses in
 * `QueryStatus` declaration order, and `Stopping`, which is winding down but has
 * not finished. The complement is {@link STOPPED_QUERY_STATUSES}.
 *
 * Listed explicitly (rather than derived by subtraction) so the row order is
 * stable regardless of what `QueryStatus` gains later; anything new simply falls
 * in with the unrecognized rows at the end of this section.
 */
const LIVE_QUERY_STATUSES: readonly string[] = [
  QueryStatus.running,
  QueryStatus.uninitialized,
  QueryStatus.connecting,
  QueryStatus.authenticating,
  QueryStatus.acquiringWorker,
  QueryStatus.findingDispatcher,
  QueryStatus.initializing,
  QueryStatus.executing,
  QueryStatus.stopping,
];

/** A row in the {@link promptForQueryStatusFilter} picker. */
interface QueryStatusPickItem extends vscode.QuickPickItem {
  readonly status: string;
}

/**
 * Prompt for the persistent-query statuses to show, as a multi-select checkbox
 * list with one row per status and its current count.
 *
 * The rows sit in two separator-headed sections, splitting queries that have
 * finished moving from ones still worth watching:
 * - **Running** — `Running`, the transitional statuses, and `Stopping` (winding
 *   down, but not gone), followed by any status observed in the data that this
 *   extension doesn't recognize. An unknown status is not known to have stopped,
 *   so it belongs with the live ones and stays visible by default.
 * - **Stopped** — {@link STOPPED_QUERY_STATUSES}, including the unset row, since
 *   a query that reports no status has stopped without saying so.
 *
 * The Stopped section is exactly what the filter hides on first run.
 *
 * Separators are visual only: VS Code ignores every property but `label` on
 * them and they cannot be picked, so there is no way to toggle a whole section
 * in one click.
 *
 * Returns the new set of statuses to HIDE — the storage the filter actually
 * uses — or `undefined` if the picker was dismissed. A dismissal must be
 * treated as "no change" by the caller; an empty set means "hide nothing".
 * @param statusCounts How many queries currently carry each status (unset
 * bucketed under `''`).
 * @param hiddenStatuses The statuses currently hidden, used to seed the
 * checkboxes.
 */
export async function promptForQueryStatusFilter(
  statusCounts: ReadonlyMap<string, number>,
  hiddenStatuses: ReadonlySet<string>
): Promise<Set<string> | undefined> {
  const known = [...LIVE_QUERY_STATUSES, ...STOPPED_QUERY_STATUSES];
  const knownSet = new Set(known);

  // Any status the server reported that isn't in the known vocabulary still
  // gets a row so it can be hidden / shown like the rest. It goes in the
  // Running section: nothing says it has stopped.
  const unrecognized = [...statusCounts.keys()]
    .filter(status => !knownSet.has(status))
    .sort((a, b) => a.localeCompare(b));

  const statuses = [...known, ...unrecognized];

  const toItem = (status: string): QueryStatusPickItem => ({
    status,
    // `getDisplayString` returns 'None' for the unset status, which reads like
    // a status literally named "None" — spell it out instead.
    label:
      status === UNSET_QUERY_STATUS
        ? '(no status)'
        : QueryStatus.getDisplayString(status),
    description: formatCount(statusCounts.get(status) ?? 0),
    picked: !hiddenStatuses.has(status),
  });

  const items: (SeparatorPickItem | QueryStatusPickItem)[] = [
    createSeparatorPickItem('Running'),
    ...[...LIVE_QUERY_STATUSES, ...unrecognized].map(toItem),
    createSeparatorPickItem('Stopped'),
    ...STOPPED_QUERY_STATUSES.map(toItem),
  ];

  // `canPickMany` (a `QuickPickOptions` field) is what makes this a checkbox
  // list. `canSelectMany` is the `QuickPick` *class* property and would silently
  // give a single-select picker here.
  const picked = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    ignoreFocusOut: true,
    title: 'Filter Persistent Queries',
    placeHolder: 'Select the query statuses to show',
  });

  if (picked == null) {
    return undefined;
  }

  // Separators are never returned by the picker, but the item union includes
  // them — narrow before reading `status`.
  const visible = new Set(
    picked
      .filter((item): item is QueryStatusPickItem => 'status' in item)
      .map(item => item.status)
  );

  return new Set(statuses.filter(status => !visible.has(status)));
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

/**
 * Set the `isFiltered` state of a given view id. Uses extension context
 * `${viewId}.isFiltered` to store the state. This lets package.json swap between
 * two view-title actions bound to the same handler, since VS Code takes an
 * action's icon from its command (hollow funnel vs. filled funnel).
 * @param viewId The view ID to set the filtered state for.
 * @param isFiltered Whether a filter is currently hiding anything.
 */
/**
 * Set the visibility of a filter section for a given view id, as
 * `${viewId}.${section}Visible`, so package.json `when` clauses can pick which
 * of a checked / unchecked menu row pair to show.
 * @param viewId The view the section belongs to.
 * @param section The section name (used verbatim, lower-cased, in the key).
 * @param isVisible Whether the section's items are currently listed.
 */
export function setViewSectionIsVisible(
  viewId: ViewID,
  section: string,
  isVisible: boolean
): void {
  vscode.commands.executeCommand(
    'setContext',
    `${viewId}.${section.toLowerCase()}Visible`,
    isVisible
  );
}

export function setViewIsFiltered(viewId: ViewID, isFiltered: boolean): void {
  vscode.commands.executeCommand(
    'setContext',
    `${viewId}.isFiltered`,
    isFiltered
  );
}
