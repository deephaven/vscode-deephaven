import * as vscode from 'vscode';
import type {
  ConsoleType,
  Disposable,
  IConfigService,
  IDhService,
  IServerManager,
  IToastService,
  ServerState,
} from '../types';
import {
  assertDefined,
  createConnectionOption,
  createConnectionQuickPick,
  createConnectStatusBarItem,
  getConnectionsForConsoleType,
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
    configService: IConfigService,
    serverManager: IServerManager,
    outputChannel: vscode.OutputChannel,
    toastService: IToastService
  ) {
    this._context = context;
    this._config = configService;
    this._serverManager = serverManager;
    this._outputChannel = outputChannel;
    this._toaster = toastService;

    this.initializeConnectionStatusBarItem();
    this.initializeServerManager();
  }

  private readonly _context: vscode.ExtensionContext;
  private readonly _config: IConfigService;
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
    connectionOrServer: ServerState | IDhService,
    editor: vscode.TextEditor
  ): Promise<void> => {
    updateConnectionStatusBarItem(this._connectStatusBarItem, 'connecting');

    let newConnectionUrl: URL | null = null;

    if ('url' in connectionOrServer) {
      const cn = await this._serverManager.connectToServer(
        connectionOrServer.url
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
  ): Promise<IDhService | null> => {
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
   * Prompt user to select a connection and apply the selection.
   */
  onPromptUserToSelectConnection = async (): Promise<boolean> => {
    assertDefined(vscode.window.activeTextEditor, 'activeTextEditor');
    assertDefined(this._serverManager, 'serverManager');

    const editor = vscode.window.activeTextEditor;

    // In case this is called before the server manager has polled for servers,
    // we want to make sure at least one check for running servers is done.
    await this._serverManager.ensureHasPolledServers();

    const runningServersWithoutConnections = this._serverManager.getServers({
      isRunning: true,
      hasConnections: false,
    });

    const connections: IDhService[] = await getConnectionsForConsoleType(
      this._serverManager.getConnections(),
      editor.document.languageId as ConsoleType
    );

    const editorActiveConnectionUrl = this._serverManager.getUriConnection(
      editor.document.uri
    )?.serverUrl;

    let selectedCnResult: ServerState | IDhService | null = null;

    try {
      selectedCnResult = await createConnectionQuickPick(
        runningServersWithoutConnections,
        connections,
        editor.document.languageId,
        editorActiveConnectionUrl
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