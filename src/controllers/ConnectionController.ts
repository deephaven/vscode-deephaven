import * as vscode from 'vscode';
import type {
  ConsoleType,
  IDisposable,
  IServerManager,
  IToastService,
  ConnectionState,
  ServerState,
} from '../types';
import {
  createConnectionOption,
  createConnectionQuickPick,
  createConnectionQuickPickOptions,
  createConnectStatusBarItem,
  getConsoleType,
  getServerUrlFromState,
  isConnectionState,
  isSupportedLanguageId,
  Logger,
  updateConnectionStatusBarItem,
} from '../util';
import { getConnectionsForConsoleType } from '../services';
import {
  CONNECT_TO_SERVER_CMD,
  CONNECT_TO_SERVER_OPERATE_AS_CMD,
  DISCONNECT_EDITOR_CMD,
  DISCONNECT_FROM_SERVER_CMD,
  SELECT_CONNECTION_COMMAND,
  UnsupportedConsoleTypeError,
} from '../common';
import { ControllerBase } from './ControllerBase';
import { assertDefined } from '../shared';
import type { CreateQueryViewProvider } from '../providers';

const logger = new Logger('ConnectionController');

export class ConnectionController
  extends ControllerBase
  implements IDisposable
{
  constructor(
    context: vscode.ExtensionContext,
    createQueryViewProvider: CreateQueryViewProvider,
    serverManager: IServerManager,
    outputChannel: vscode.OutputChannel,
    toastService: IToastService
  ) {
    super();

    this._context = context;
    this._createQueryViewProvider = createQueryViewProvider;
    this._serverManager = serverManager;
    this._outputChannel = outputChannel;
    this._toaster = toastService;

    this.initializeConnectionStatusBarItem();
    this.initializeServerManager();

    /** Create server connection */
    this.registerCommand(CONNECT_TO_SERVER_CMD, this.onConnectToServer);

    /** Create server connection operating as another user */
    this.registerCommand(
      CONNECT_TO_SERVER_OPERATE_AS_CMD,
      this.onConnectToServerOperateAs
    );

    /** Disconnect editor */
    this.registerCommand(DISCONNECT_EDITOR_CMD, this.onDisconnectEditor);

    /** Disconnect from server */
    this.registerCommand(
      DISCONNECT_FROM_SERVER_CMD,
      this.onDisconnectFromServer
    );

    /** Select connection to run scripts against */
    this.registerCommand(
      SELECT_CONNECTION_COMMAND,
      this.onPromptUserToSelectConnection
    );
  }

  private readonly _context: vscode.ExtensionContext;
  private readonly _createQueryViewProvider: CreateQueryViewProvider;
  private readonly _serverManager: IServerManager;
  private readonly _outputChannel: vscode.OutputChannel;
  private readonly _toaster: IToastService;

  private _connectStatusBarItem: vscode.StatusBarItem | null = null;

  async dispose(): Promise<void> {}

  /**
   * Initialize connection status bar item.
   */
  initializeConnectionStatusBarItem = (): void => {
    this._connectStatusBarItem = createConnectStatusBarItem(false);
    this._context.subscriptions.push(this._connectStatusBarItem);

    this.updateConnectionStatusBarItem();

    const args = [
      this.updateConnectionStatusBarItem,
      null,
      this._context.subscriptions,
    ] as const;

    vscode.window.onDidChangeActiveTextEditor(...args);
    vscode.workspace.onDidChangeConfiguration(...args);
    // Handle scenarios such as languageId change within an already open document
    vscode.workspace.onDidOpenTextDocument(...args);
  };

  initializeServerManager = (): void => {
    assertDefined(this._serverManager, 'serverManager');

    this._serverManager.onDidRegisterEditor(
      () => {
        this.updateConnectionStatusBarItem();
      },
      undefined,
      this._context.subscriptions
    );

    this._serverManager.onDidServerStatusChange(
      server => {
        // Auto connect to pip servers managed by extension when they start
        if (server.isManaged && server.isRunning) {
          this._serverManager.connectToServer(server.url, 'python');
        }
      },
      undefined,
      this._context.subscriptions
    );
  };

  /**
   * Update status bar item.
   */
  updateConnectionStatusBarItem = (): void => {
    assertDefined(this._connectStatusBarItem, 'connectStatusBarItem');

    const editor = vscode.window.activeTextEditor;

    if (
      editor == null ||
      (!isSupportedLanguageId(editor.document.languageId) &&
        editor.document.languageId !== 'markdown')
    ) {
      this._connectStatusBarItem.hide();
      return;
    }

    this._connectStatusBarItem.show();

    const dhService = this._serverManager.getUriConnection(editor.document.uri);

    if (dhService == null) {
      updateConnectionStatusBarItem(this._connectStatusBarItem, 'disconnected');
      return;
    }

    updateConnectionStatusBarItem(
      this._connectStatusBarItem,
      'connected',
      createConnectionOption('DHC')(dhService.serverUrl)
    );
  };

  connectEditor = async (
    connectionOrServer: ConnectionState | ServerState,
    uri: vscode.Uri,
    languageId: string
  ): Promise<void> => {
    updateConnectionStatusBarItem(this._connectStatusBarItem, 'connecting');

    let newConnectionUrl: URL | null = null;

    if ('url' in connectionOrServer) {
      const cn = await this._serverManager.connectToServer(
        connectionOrServer.url,
        getConsoleType(languageId)
      );

      if (cn == null) {
        return;
      }

      connectionOrServer = cn;
      newConnectionUrl = cn.serverUrl;
    }

    try {
      await this._serverManager.setEditorConnection(
        uri,
        languageId,
        connectionOrServer
      );
    } catch (err) {
      updateConnectionStatusBarItem(this._connectStatusBarItem, 'disconnected');

      // If our error was an unsupported console type on a newly created connection,
      // disconnect from it.
      if (err instanceof UnsupportedConsoleTypeError && newConnectionUrl) {
        this._serverManager.disconnectFromServer(newConnectionUrl);
        this._toaster.error(err.message);
      }

      throw err;
    }

    updateConnectionStatusBarItem(
      this._connectStatusBarItem,
      'connected',
      createConnectionOption('DHC')(connectionOrServer.serverUrl)
    );
  };

  /**
   * Get or create a connection for the given uri.
   * @param uri Uri to get or create a connection for.
   * @param languageId Language id to use for the connection.
   */
  getOrCreateConnection = async (
    uri: vscode.Uri,
    languageId: string
  ): Promise<ConnectionState | null> => {
    assertDefined(this._outputChannel, 'outputChannel');
    assertDefined(this._serverManager, 'serverManager');
    assertDefined(this._toaster, 'toaster');

    // Get existing connection for the editor
    let dhService = await this._serverManager.getEditorConnection(uri);

    if (dhService != null) {
      return dhService;
    }

    const supportingConnections = await getConnectionsForConsoleType(
      this._serverManager.getConnections(),
      languageId as ConsoleType
    );

    const availableServers = this._serverManager.getServers({
      isRunning: true,
      hasConnections: false,
    });

    if (supportingConnections.length === 1 && availableServers.length === 0) {
      // If we only have 1 supporting connection, and no available servers, use
      // the available connection.
      await this.connectEditor(supportingConnections[0], uri, languageId);
    } else if (
      // If there are no active connections that can support the editor, and we
      // only have 1 available server, just connect to it instead of prompting the
      // user to select an available server / connection.
      supportingConnections.length === 0 &&
      availableServers.length === 1
    ) {
      await this.connectEditor(availableServers[0], uri, languageId);
    } else {
      // If there are multiple options to select, prompt the user to select one.
      const isSelected = await this.onPromptUserToSelectConnection(languageId);

      // User cancelled the selection or an error occurred
      if (!isSelected) {
        return null;
      }
    }

    dhService = await this._serverManager.getEditorConnection(uri);

    if (dhService == null) {
      const logMsg = `No active connection found supporting '${languageId}' console type.`;
      logger.debug(logMsg);
      this._outputChannel.appendLine(logMsg);
      this._toaster.error(logMsg);
    }

    return dhService;
  };

  /**
   * Handle connecting to a server
   */
  onConnectToServer = async (
    serverState: ServerState,
    operateAsAnotherUser?: boolean
  ): Promise<void> => {
    const languageId = vscode.window.activeTextEditor?.document.languageId;

    // DHE servers need to specify the console type for each worker creation.
    // Use the active editor's language id to determine the console type.
    const workerConsoleType =
      serverState.type === 'DHE' ? getConsoleType(languageId) : undefined;

    this._serverManager?.connectToServer(
      serverState.url,
      workerConsoleType,
      operateAsAnotherUser
    );
  };

  /**
   * Handle connecting to a server as another user.
   * @param serverState
   */
  onConnectToServerOperateAs = async (
    serverState: ServerState | undefined
  ): Promise<void> => {
    // Sometimes view/item/context commands pass undefined instead of a tree.
    // node. Just ignore.
    if (serverState == null) {
      return;
    }

    this.onConnectToServer(serverState, true);
  };

  /**
   * Disconnect editor from active connections.
   * @param uri
   */
  onDisconnectEditor = (uri: vscode.Uri | undefined): void => {
    // Sometimes view/item/context commands pass undefined instead of a tree.
    // node. Just ignore.
    if (uri == null) {
      return;
    }

    this._serverManager?.disconnectEditor(uri);
    this.updateConnectionStatusBarItem();
  };

  /**
   * Handle disconnecting from a server.
   */
  onDisconnectFromServer = async (
    serverOrConnectionState: ServerState | ConnectionState | undefined
  ): Promise<void> => {
    // Sometimes view/item/context commands pass undefined instead of a tree.
    // node. Just ignore.
    if (serverOrConnectionState == null) {
      return;
    }

    const url = getServerUrlFromState(serverOrConnectionState);

    if (url.origin === this._createQueryViewProvider.activeServerUrl?.origin) {
      this._createQueryViewProvider.hide();
    }

    // ConnectionState (connection only disconnect)
    if (isConnectionState(serverOrConnectionState)) {
      this._serverManager?.disconnectFromServer(url);
      return;
    }

    // DHC ServerState
    if (serverOrConnectionState.type === 'DHC') {
      await this._serverManager?.disconnectFromServer(url);
    }
    // DHE ServerState
    else {
      await this._serverManager?.disconnectFromDHEServer(url);
    }

    this.updateConnectionStatusBarItem();
  };

  /**
   * Prompt user to select a connection and apply the selection. The options
   * presented to the user consist of:
   * 1. Active connections that support the console type of the active editor.
   * 2. A list of running servers composed of:
   *   - DHC servers that don't yet have a connection
   *   - All running DHE servers
   * @param languageId Optional language id to use for the connection. Defaults
   * to the language id of the active editor.
   */
  onPromptUserToSelectConnection = async (
    languageId?: string
  ): Promise<boolean> => {
    assertDefined(vscode.window.activeTextEditor, 'activeTextEditor');
    assertDefined(this._serverManager, 'serverManager');

    const editor = vscode.window.activeTextEditor;
    const uri = editor.document.uri;
    if (languageId == null) {
      languageId = editor.document.languageId;
    }

    const updateStatusPromise = this._serverManager.updateStatus();

    // We always update status when the user is prompted to select a connection,
    // but we only block if this is the first time we're updating status. For the
    // most common use cases, other events will trigger the status update before
    // the user attempts to see the available servers (see handlers in
    // `ExtensionController.initializeServerUpdates`). One edge case is if the
    // user is already in vscode while a server is starting / stopping, there
    // may not be an event that proactively updates the status. Worst case
    // scenario, the user will attempt to connect, see no server, then try again
    // and see it. Alternatively, they can open the DH panel and explicitly refresh
    // the server list.
    if (!this._serverManager.hasEverUpdatedStatus()) {
      await updateStatusPromise;
    }

    // Only include DHC servers that don't have any connections yet since their
    // single connection will be included in the `connectionsForConsoleType` list.
    const runningDHCServersWithoutConnections = this._serverManager.getServers({
      isRunning: true,
      hasConnections: false,
      type: 'DHC',
    });

    // Since DHE servers allow creating multiple workers, always include the
    // server in the list regardless of how many worker connections already exist.
    const runningDHEServers = this._serverManager.getServers({
      isRunning: true,
      type: 'DHE',
    });

    const connectionsForConsoleType: ConnectionState[] =
      await getConnectionsForConsoleType(
        this._serverManager.getConnections(),
        languageId as ConsoleType
      );

    const editorActiveConnectionUrl =
      this._serverManager.getUriConnection(uri)?.serverUrl;

    let selectedCnResult: ConnectionState | ServerState | null = null;

    try {
      selectedCnResult = await createConnectionQuickPick(
        createConnectionQuickPickOptions(
          [...runningDHCServersWithoutConnections, ...runningDHEServers],
          connectionsForConsoleType,
          languageId,
          editorActiveConnectionUrl
        )
      );

      if (selectedCnResult == null) {
        return false;
      }

      await this.connectEditor(selectedCnResult, uri, languageId);

      return true;
    } catch (err) {
      this._toaster.error(err instanceof Error ? err.message : String(err));
      return false;
    }
  };
}
