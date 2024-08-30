import * as vscode from 'vscode';
import {
  CONNECT_TO_SERVER_CMD,
  CREATE_NEW_TEXT_DOC_CMD,
  DISCONNECT_EDITOR_CMD,
  DISCONNECT_FROM_SERVER_CMD,
  DOWNLOAD_LOGS_CMD,
  OPEN_IN_BROWSER_CMD,
  REFRESH_SERVER_CONNECTION_TREE_CMD,
  REFRESH_SERVER_TREE_CMD,
  RUN_CODE_COMMAND,
  RUN_SELECTION_COMMAND,
  SELECT_CONNECTION_COMMAND,
  START_SERVER_CMD,
  STOP_SERVER_CMD,
  VIEW_ID,
} from '../common';
import {
  assertDefined,
  ExtendedMap,
  getEditorForUri,
  getTempDir,
  isSupportedLanguageId,
  Logger,
  OutputChannelWithHistory,
  Toaster,
} from '../util';
import {
  RunCommandCodeLensProvider,
  ServerTreeProvider,
  ServerConnectionTreeProvider,
  runSelectedLinesHoverProvider,
} from '../providers';
import { DhcServiceFactory, ServerManager } from '../services';
import type {
  Disposable,
  IConfigService,
  IDhService,
  IDhServiceFactory,
  IServerManager,
  IToastService,
  ServerConnectionTreeView,
  ServerState,
  ServerTreeView,
} from '../types';
import { ServerConnectionTreeDragAndDropController } from './ServerConnectionTreeDragAndDropController';
import { ConnectionController } from './ConnectionController';
import { PipServerController } from './PipServerController';

const logger = new Logger('ExtensionController');

export class ExtensionController implements Disposable {
  constructor(context: vscode.ExtensionContext, configService: IConfigService) {
    this._context = context;
    this._config = configService;

    this.initializeDiagnostics();
    this.initializeConfig();
    this.initializeCodeLenses();
    this.initializeHoverProviders();
    this.initializeMessaging();
    this.initializeServerManager();
    this.initializeTempDirectory();
    this.initializeConnectionController();
    this.initializePipServerController();
    this.initializeCommands();
    this.initializeWebViews();
    this.initializeServerUpdates();

    logger.info(
      'Congratulations, your extension "vscode-deephaven" is now active!'
    );

    this._outputChannel?.show();
    this._outputChannel?.appendLine('Deephaven extension activated');
  }

  readonly _context: vscode.ExtensionContext;
  readonly _config: IConfigService;

  private _connectionController: ConnectionController | null = null;
  private _pipServerController: PipServerController | null = null;
  private _dhcServiceFactory: IDhServiceFactory | null = null;
  private _serverManager: IServerManager | null = null;
  private _serverTreeProvider: ServerTreeProvider | null = null;
  private _serverConnectionTreeProvider: ServerConnectionTreeProvider | null =
    null;
  private _serverTreeView: ServerTreeView | null = null;
  private _serverConnectionTreeView: ServerConnectionTreeView | null = null;

  private _pythonDiagnostics: vscode.DiagnosticCollection | null = null;
  private _outputChannel: vscode.OutputChannel | null = null;
  private _outputChannelDebug: OutputChannelWithHistory | null = null;
  private _toaster: IToastService | null = null;

  async dispose(): Promise<void> {}

  /**
   * Initialize code lenses for running Deephaven code.
   */
  initializeCodeLenses = (): void => {
    const codelensProvider = new RunCommandCodeLensProvider();

    this._context.subscriptions.push(
      vscode.languages.registerCodeLensProvider('groovy', codelensProvider),
      vscode.languages.registerCodeLensProvider('python', codelensProvider)
    );
  };

  /**
   * Initialize configuration.
   */
  initializeConfig = (): void => {
    vscode.workspace.onDidChangeConfiguration(
      () => {
        this._outputChannel?.appendLine('Configuration changed');
      },
      null,
      this._context.subscriptions
    );
  };

  /**
   * Initialize connection controller.
   */
  initializeConnectionController = (): void => {
    assertDefined(this._serverManager, 'serverManager');
    assertDefined(this._outputChannel, 'outputChannel');
    assertDefined(this._toaster, 'toaster');

    this._connectionController = new ConnectionController(
      this._context,
      this._serverManager,
      this._outputChannel,
      this._toaster
    );

    this._context.subscriptions.push(this._connectionController);
  };

  /**
   * Initialize pip server controller.
   */
  initializePipServerController = (): void => {
    assertDefined(this._outputChannel, 'outputChannel');
    assertDefined(this._toaster, 'toaster');

    this._pipServerController = new PipServerController(
      this._context,
      this._serverManager!,
      [10001, 10002, 10003, 10004],
      this._outputChannel,
      this._toaster
    );
  };

  /**
   * Initialize diagnostics collections.
   */
  initializeDiagnostics = (): void => {
    this._pythonDiagnostics =
      vscode.languages.createDiagnosticCollection('python');

    // Clear diagnostics on save
    vscode.workspace.onDidSaveTextDocument(
      doc => {
        this._pythonDiagnostics?.set(doc.uri, []);
      },
      null,
      this._context.subscriptions
    );
  };

  /**
   * Initialize hover providers.
   */
  initializeHoverProviders = (): void => {
    vscode.languages.registerHoverProvider(
      'groovy',
      runSelectedLinesHoverProvider
    );

    vscode.languages.registerHoverProvider(
      'python',
      runSelectedLinesHoverProvider
    );
  };

  /**
   * Initialize output channels, Logger and Toaster.
   */
  initializeMessaging = (): void => {
    this._outputChannel = vscode.window.createOutputChannel('Deephaven', 'log');
    this._outputChannelDebug = new OutputChannelWithHistory(
      this._context,
      vscode.window.createOutputChannel('Deephaven Debug', 'log')
    );

    Logger.addConsoleHandler();
    Logger.addOutputChannelHandler(this._outputChannelDebug);

    this._toaster = new Toaster();

    this._context.subscriptions.push(
      this._outputChannel,
      this._outputChannelDebug
    );
  };

  initializeServerManager = (): void => {
    assertDefined(this._pythonDiagnostics, 'pythonDiagnostics');
    assertDefined(this._outputChannel, 'outputChannel');
    assertDefined(this._toaster, 'toaster');

    this._dhcServiceFactory = new DhcServiceFactory(
      new ExtendedMap<string, vscode.WebviewPanel>(),
      this._pythonDiagnostics,
      this._outputChannel,
      this._toaster
    );

    this._serverManager = new ServerManager(
      this._config,
      this._dhcServiceFactory
    );

    this._serverManager.onDidDisconnect(serverUrl => {
      this._outputChannel?.appendLine(
        `Disconnected from server: '${serverUrl}'.`
      );
    });

    vscode.workspace.onDidChangeConfiguration(
      () => {
        this._serverManager?.loadServerConfig();
        this._pipServerController?.syncManagedServers();
      },
      undefined,
      this._context.subscriptions
    );

    // Expand to show any new editor URIs that are associated with a connection
    this._serverManager.onDidRegisterEditor(
      uri => {
        this._serverConnectionTreeView?.reveal(uri);
      },
      undefined,
      this._context.subscriptions
    );
  };

  /**
   * Initialize temp directory.
   */
  initializeTempDirectory = (): void => {
    // recreate tmp dir that will be used to dowload JS Apis
    getTempDir(true /*recreate*/);
  };

  /**
   * Register commands for the extension.
   */
  initializeCommands = (): void => {
    assertDefined(this._connectionController, 'connectionController');

    /** Create server connection */
    this.registerCommand(CONNECT_TO_SERVER_CMD, this.onConnectToServer);

    /** Create new document */
    this.registerCommand(CREATE_NEW_TEXT_DOC_CMD, this.onCreateNewDocument);

    /** Disconnect editor */
    this.registerCommand(DISCONNECT_EDITOR_CMD, this.onDisconnectEditor);

    /** Disconnect from server */
    this.registerCommand(
      DISCONNECT_FROM_SERVER_CMD,
      this.onDisconnectFromServer
    );

    /** Download logs and open in editor */
    this.registerCommand(DOWNLOAD_LOGS_CMD, this.onDownloadLogs);

    /** Open server in browser */
    this.registerCommand(OPEN_IN_BROWSER_CMD, this.onOpenInBrowser);

    /** Run all code in active editor */
    this.registerCommand(RUN_CODE_COMMAND, this.onRunCode);

    /** Run selected code in active editor */
    this.registerCommand(RUN_SELECTION_COMMAND, this.onRunSelectedCode);

    /** Select connection to run scripts against */
    this.registerCommand(
      SELECT_CONNECTION_COMMAND,
      this._connectionController.onPromptUserToSelectConnection
    );

    /** Refresh server tree */
    this.registerCommand(REFRESH_SERVER_TREE_CMD, this.onRefreshServerTrees);

    /** Refresh server connection tree */
    this.registerCommand(
      REFRESH_SERVER_CONNECTION_TREE_CMD,
      this.onRefreshServerTrees
    );

    /** Start a server */
    this.registerCommand(START_SERVER_CMD, this.onStartServer);

    /** Stop a server */
    this.registerCommand(STOP_SERVER_CMD, this.onStopServer);
  };

  /**
   * Register web views for the extension.
   */
  initializeWebViews = (): void => {
    assertDefined(this._serverManager, 'serverManager');

    // Server tree
    this._serverTreeProvider = new ServerTreeProvider(this._serverManager);
    this._serverTreeView = vscode.window.createTreeView(VIEW_ID.serverTree, {
      showCollapseAll: true,
      treeDataProvider: this._serverTreeProvider,
    });

    // Connection tree
    this._serverConnectionTreeProvider = new ServerConnectionTreeProvider(
      this._serverManager
    );
    const serverConnectionTreeDragAndDropController =
      new ServerConnectionTreeDragAndDropController(this._serverManager);

    this._serverConnectionTreeView = vscode.window.createTreeView(
      VIEW_ID.serverConnectionTree,
      {
        dragAndDropController: serverConnectionTreeDragAndDropController,
        showCollapseAll: true,
        treeDataProvider: this._serverConnectionTreeProvider,
      }
    );

    this._context.subscriptions.push(
      this._serverManager,
      this._serverTreeView,
      this._serverConnectionTreeView
    );
  };

  /**
   * Listen to events that will potentially update server statuses.
   */
  initializeServerUpdates = (): void => {
    assertDefined(this._serverTreeView, 'serverManager');

    vscode.window.onDidChangeWindowState(
      this.maybeUpdateServerStatuses,
      undefined,
      this._context.subscriptions
    );

    vscode.window.onDidChangeActiveTextEditor(
      editor => {
        if (isSupportedLanguageId(editor?.document.languageId)) {
          this.maybeUpdateServerStatuses();
        }
      },
      undefined,
      this._context.subscriptions
    );

    this._serverTreeView.onDidChangeVisibility(event => {
      if (event.visible) {
        this.maybeUpdateServerStatuses();
      }
    });

    this.maybeUpdateServerStatuses();
  };

  /**
   * Update server statuses if vscode window is
   * active and focused.
   */
  maybeUpdateServerStatuses = (): void => {
    // Only check servers if vscode window is active and focused
    const shouldUpdate =
      vscode.window.state.active && vscode.window.state.focused;

    if (!shouldUpdate) {
      return;
    }

    this._serverManager?.updateStatus();
  };

  /**
   * Handle connecting to a server
   */
  onConnectToServer = async (serverState: ServerState): Promise<void> => {
    this._serverManager?.connectToServer(serverState.url);
  };

  /**
   * Create a new text document based on the given connection capabilities.
   * @param dhService
   */
  onCreateNewDocument = async (dhService: IDhService): Promise<void> => {
    const language = (await dhService.supportsConsoleType('python'))
      ? 'python'
      : 'groovy';

    const doc = await vscode.workspace.openTextDocument({
      language,
    });

    const editor = await vscode.window.showTextDocument(doc);

    this._serverManager?.setEditorConnection(editor, dhService);
  };

  /**
   * Disconnect editor from active connections.
   * @param uri
   */
  onDisconnectEditor = (uri: vscode.Uri): void => {
    this._serverManager?.disconnectEditor(uri);
  };

  /**
   * Handle disconnecting from a server.
   */
  onDisconnectFromServer = async (dhService: IDhService): Promise<void> => {
    this._serverManager?.disconnectFromServer(dhService.serverUrl);
  };

  /**
   * Handle download logs command
   */
  onDownloadLogs = async (): Promise<void> => {
    assertDefined(this._outputChannelDebug, 'outputChannelDebug');
    assertDefined(this._toaster, 'toaster');

    const uri = await this._outputChannelDebug.downloadHistoryToFile();

    if (uri != null) {
      this._toaster.info(`Downloaded logs to ${uri.fsPath}`);
      vscode.window.showTextDocument(uri);
    }
  };

  onOpenInBrowser = async (serverState: ServerState): Promise<void> => {
    vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.parse(serverState.url.toString())
    );
  };

  onRefreshServerTrees = async (): Promise<void> => {
    await this._pipServerController?.syncManagedServers();
    await this._serverManager?.updateStatus();

    this._serverConnectionTreeProvider?.refresh();
    this._serverConnectionTreeProvider?.refresh();
  };

  /**
   * Run all code in editor for given uri.
   * @param uri
   */
  onRunCode = async (uri: vscode.Uri): Promise<void> => {
    assertDefined(this._connectionController, 'connectionController');

    const editor = await getEditorForUri(uri);
    const dhService =
      await this._connectionController.getOrCreateConnection(uri);
    await dhService?.runEditorCode(editor);
  };

  /**
   * Run selected code in editor for given uri.
   * @param uri
   */
  onRunSelectedCode = async (uri?: vscode.Uri): Promise<void> => {
    assertDefined(this._connectionController, 'connectionController');

    if (uri == null) {
      uri = vscode.window.activeTextEditor?.document.uri;
    }

    if (uri == null) {
      return;
    }

    const editor = await getEditorForUri(uri);
    const dhService =
      await this._connectionController.getOrCreateConnection(uri);
    await dhService?.runEditorCode(editor, true);
  };

  /**
   * Start a server.
   */
  onStartServer = (): void => {
    this._pipServerController?.startServer();
  };

  /**
   * Stop a server.
   * @param value
   */
  onStopServer = (value: ServerState): void => {
    this._pipServerController?.stopServer(value.url);
  };

  /**
   * Register a command and add it's subscription to the context.
   */
  registerCommand = (
    ...args: Parameters<typeof vscode.commands.registerCommand>
  ): void => {
    const cmd = vscode.commands.registerCommand(...args);
    this._context.subscriptions.push(cmd);
  };
}
