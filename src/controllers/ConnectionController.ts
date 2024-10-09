import * as vscode from 'vscode';
import type {
  ConsoleType,
  Disposable,
  IServerManager,
  IToastService,
  ConnectionState,
  ServerState,
} from '../types';
import {
  assertDefined,
  createConnectionOption,
  createConnectionQuickPick,
  createConnectionQuickPickOptions,
  createConnectStatusBarItem,
  getConnectionsForConsoleType,
  getConsoleType,
  getEditorForUri,
  isSupportedLanguageId,
  Logger,
  updateConnectionStatusBarItem,
} from '../util';
import { UnsupportedConsoleTypeError } from '../common';

const logger = new Logger('ConnectionController');

export class ConnectionController implements Disposable {
  constructor(
    context: vscode.ExtensionContext,
    serverManager: IServerManager,
    outputChannel: vscode.OutputChannel,
    toastService: IToastService
  ) {
    this._context = context;
    this._serverManager = serverManager;
    this._outputChannel = outputChannel;
    this._toaster = toastService;

    this.initializeConnectionStatusBarItem();
    this.initializeServerManager();
  }

  private readonly _context: vscode.ExtensionContext;
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

    if (editor == null || !isSupportedLanguageId(editor.document.languageId)) {
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
    editor: vscode.TextEditor
  ): Promise<void> => {
    updateConnectionStatusBarItem(this._connectStatusBarItem, 'connecting');

    let newConnectionUrl: URL | null = null;

    if ('url' in connectionOrServer) {
      const cn = await this._serverManager.connectToServer(
        connectionOrServer.url,
        getConsoleType(editor.document.languageId)
      );

      if (cn == null) {
        return;
      }

      connectionOrServer = cn;
      newConnectionUrl = cn.serverUrl;
    }

    try {
      await this._serverManager.setEditorConnection(editor, connectionOrServer);
    } catch (err) {
      updateConnectionStatusBarItem(this._connectStatusBarItem, 'disconnected');

      // If our error was an unsupported console type on a newly created connection,
      // disconnect from it.
      if (err instanceof UnsupportedConsoleTypeError && newConnectionUrl) {
        this._serverManager.disconnectFromServer(newConnectionUrl);
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
   * @param uri
   */
  getOrCreateConnection = async (
    uri: vscode.Uri
  ): Promise<ConnectionState | null> => {
    assertDefined(this._outputChannel, 'outputChannel');
    assertDefined(this._serverManager, 'serverManager');
    assertDefined(this._toaster, 'toaster');

    const editor = await getEditorForUri(uri);

    // Get existing connection for the editor
    let dhService = await this._serverManager.getEditorConnection(editor);

    if (dhService != null) {
      return dhService;
    }

    const supportingConnections = await getConnectionsForConsoleType(
      this._serverManager.getConnections(),
      editor.document.languageId as ConsoleType
    );

    const availableServers = this._serverManager.getServers({
      isRunning: true,
      hasConnections: false,
    });

    if (supportingConnections.length === 1 && availableServers.length === 0) {
      // If we only have 1 supporting connection, and no available servers, use
      // the available connection.
      await this.connectEditor(supportingConnections[0], editor);
    } else if (
      // If there are no active connections that can support the editor, and we
      // only have 1 available server, just connect to it instead of prompting the
      // user to select an available server / connection.
      supportingConnections.length === 0 &&
      availableServers.length === 1
    ) {
      await this.connectEditor(availableServers[0], editor);
    } else {
      // If there are multiple options to select, prompt the user to select one.
      const isSelected = await this.onPromptUserToSelectConnection();

      // User cancelled the selection or an error occurred
      if (!isSelected) {
        return null;
      }
    }

    dhService = await this._serverManager.getEditorConnection(editor);

    if (dhService == null) {
      const logMsg = `No active connection found supporting '${editor.document.languageId}' console type.`;
      logger.debug(logMsg);
      this._outputChannel.appendLine(logMsg);
      this._toaster.error(logMsg);
    }

    return dhService;
  };

  /**
   * Prompt user to select a connection and apply the selection. The options
   * presented to the user consist of:
   * 1. Active connections that support the console type of the active editor.
   * 2. A list of running servers composed of:
   *   - DHC servers that don't yet have a connection
   *   - All running DHE servers
   */
  onPromptUserToSelectConnection = async (): Promise<boolean> => {
    assertDefined(vscode.window.activeTextEditor, 'activeTextEditor');
    assertDefined(this._serverManager, 'serverManager');

    const editor = vscode.window.activeTextEditor;

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
        editor.document.languageId as ConsoleType
      );

    const editorActiveConnectionUrl = this._serverManager.getUriConnection(
      editor.document.uri
    )?.serverUrl;

    let selectedCnResult: ConnectionState | ServerState | null = null;

    try {
      selectedCnResult = await createConnectionQuickPick(
        createConnectionQuickPickOptions(
          [...runningDHCServersWithoutConnections, ...runningDHEServers],
          connectionsForConsoleType,
          editor.document.languageId,
          editorActiveConnectionUrl
        )
      );

      if (selectedCnResult == null) {
        return false;
      }

      await this.connectEditor(selectedCnResult, editor);

      return true;
    } catch (err) {
      this._toaster.error(err instanceof Error ? err.message : String(err));
      return false;
    }
  };
}
