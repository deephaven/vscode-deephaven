import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import type {
  EnterpriseDhType as DheType,
  EnterpriseClient,
  LoginCredentials as DheLoginCredentials,
} from '@deephaven-enterprise/jsapi-types';
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
  getEditorForUri,
  getTempDir,
  isInstanceOf,
  isSupportedLanguageId,
  Logger,
  OutputChannelWithHistory,
  Toaster,
} from '../util';
import {
  RunCommandCodeLensProvider,
  ServerTreeProvider,
  ServerConnectionTreeProvider,
  ServerConnectionPanelTreeProvider,
  runSelectedLinesHoverProvider,
} from '../providers';
import {
  DhcServiceFactory,
  DheClientCache,
  DheJsApiCache,
  DheService,
  DheServiceCache,
  DhService,
  PanelService,
  ServerManager,
  URLMap,
} from '../services';
import type {
  ConnectionState,
  Disposable,
  ICacheService,
  IConfigService,
  IDheService,
  IDheServiceFactory,
  IDhService,
  IDhServiceFactory,
  IPanelService,
  IServerManager,
  IToastService,
  Lazy,
  ServerConnectionPanelNode,
  ServerConnectionPanelTreeView,
  ServerConnectionTreeView,
  ServerState,
  ServerTreeView,
} from '../types';
import { ServerConnectionTreeDragAndDropController } from './ServerConnectionTreeDragAndDropController';
import { ConnectionController } from './ConnectionController';
import { PipServerController } from './PipServerController';
import { PanelController } from './PanelController';
import { UserLoginController } from './UserLoginController';

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
    this.initializePanelController();
    this.initializePipServerController();
    this.initializeUserLoginController();
    this.initializeCommands();
    this.initializeWebViews();
    this.initializeServerUpdates();

    logger.info(
      'Congratulations, your extension "vscode-deephaven" is now active!'
    );

    this._outputChannel?.appendLine('Deephaven extension activated');
  }

  readonly _context: vscode.ExtensionContext;
  readonly _config: IConfigService;

  private _connectionController: ConnectionController | null = null;
  private _coreCredentialsCache: URLMap<Lazy<DhcType.LoginCredentials>> | null =
    null;
  private _dheClientCache: ICacheService<URL, EnterpriseClient> | null = null;
  private _dheCredentialsCache: URLMap<DheLoginCredentials> | null = null;
  private _dheServiceCache: ICacheService<URL, IDheService> | null = null;
  private _panelController: PanelController | null = null;
  private _panelService: IPanelService | null = null;
  private _pipServerController: PipServerController | null = null;
  private _dhcServiceFactory: IDhServiceFactory | null = null;
  private _dheJsApiCache: ICacheService<URL, DheType> | null = null;
  private _dheServiceFactory: IDheServiceFactory | null = null;
  private _serverManager: IServerManager | null = null;
  private _userLoginController: UserLoginController | null = null;

  // Tree providers
  private _serverTreeProvider: ServerTreeProvider | null = null;
  private _serverConnectionTreeProvider: ServerConnectionTreeProvider | null =
    null;
  private _serverConnectionPanelTreeProvider: ServerConnectionPanelTreeProvider | null =
    null;

  // Tree views
  private _serverTreeView: ServerTreeView | null = null;
  private _serverConnectionTreeView: ServerConnectionTreeView | null = null;
  private _serverConnectionPanelTreeView: ServerConnectionPanelTreeView | null =
    null;

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
   * Initialize panel controller.
   */
  initializePanelController = (): void => {
    assertDefined(this._coreCredentialsCache, 'credentialsCache');
    assertDefined(this._panelService, 'panelService');
    assertDefined(this._serverManager, 'serverManager');

    this._panelController = new PanelController(
      this._coreCredentialsCache,
      this._serverManager,
      this._panelService
    );

    this._context.subscriptions.push(this._panelController);
  };

  /**
   * Initialize pip server controller.
   */
  initializePipServerController = (): void => {
    assertDefined(this._outputChannel, 'outputChannel');
    assertDefined(this._serverManager, 'serverManager');
    assertDefined(this._toaster, 'toaster');

    this._pipServerController = new PipServerController(
      this._context,
      this._serverManager,
      this._outputChannel,
      this._toaster
    );
  };

  /**
   * Initialize user login controller.
   */
  initializeUserLoginController = (): void => {
    assertDefined(this._dheCredentialsCache, 'dheCredentialsCache');

    this._userLoginController = new UserLoginController(
      this._dheCredentialsCache
    );

    this._context.subscriptions.push(this._userLoginController);
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

    this._coreCredentialsCache = new URLMap<Lazy<DhcType.LoginCredentials>>();
    this._dheCredentialsCache = new URLMap<DheLoginCredentials>();

    this._dheJsApiCache = new DheJsApiCache();
    this._context.subscriptions.push(this._dheJsApiCache);

    this._dheClientCache = new DheClientCache(this._dheJsApiCache);
    this._context.subscriptions.push(this._dheClientCache);

    this._panelService = new PanelService();
    this._context.subscriptions.push(this._panelService);

    this._dhcServiceFactory = new DhcServiceFactory(
      this._coreCredentialsCache,
      this._panelService,
      this._pythonDiagnostics,
      this._outputChannel,
      this._toaster
    );

    this._dheServiceFactory = DheService.factory(
      this._coreCredentialsCache,
      this._dheClientCache,
      this._dheCredentialsCache,
      this._dheJsApiCache
    );

    this._dheServiceCache = new DheServiceCache(this._dheServiceFactory);
    this._context.subscriptions.push(this._dheServiceCache);

    this._serverManager = new ServerManager(
      this._config,
      this._coreCredentialsCache,
      this._dhcServiceFactory,
      this._dheServiceCache
    );
    this._context.subscriptions.push(this._serverManager);

    this._serverManager.onDidDisconnect(
      serverUrl => {
        this._outputChannel?.appendLine(
          `Disconnected from server: '${serverUrl}'.`
        );
      },
      undefined,
      this._context.subscriptions
    );

    vscode.workspace.onDidChangeConfiguration(
      async () => {
        await this._serverManager?.loadServerConfig();
        await this.onRefreshServerStatus();
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
    getTempDir({ recreate: true });
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
    this.registerCommand(REFRESH_SERVER_TREE_CMD, this.onRefreshServerStatus);

    /** Refresh server connection tree */
    this.registerCommand(
      REFRESH_SERVER_CONNECTION_TREE_CMD,
      this.onRefreshServerStatus
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
    assertDefined(this._panelService, 'panelService');
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

    // Connection Panel tree
    this._serverConnectionPanelTreeProvider =
      new ServerConnectionPanelTreeProvider(
        this._serverManager,
        this._panelService
      );
    this._serverConnectionPanelTreeView =
      vscode.window.createTreeView<ServerConnectionPanelNode>(
        VIEW_ID.serverConnectionPanelTree,
        {
          showCollapseAll: true,
          treeDataProvider: this._serverConnectionPanelTreeProvider,
        }
      );

    this._context.subscriptions.push(
      this._serverTreeView,
      this._serverConnectionTreeView,
      this._serverConnectionPanelTreeView
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
  onDisconnectFromServer = async (
    connectionState: ConnectionState
  ): Promise<void> => {
    this._serverManager?.disconnectFromServer(connectionState.serverUrl);
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

  onRefreshServerStatus = async (): Promise<void> => {
    await this._pipServerController?.syncManagedServers();
    await this._serverManager?.updateStatus();
  };

  /**
   * Run all code in editor for given uri.
   * @param uri
   * @param arg
   * @param selectionOnly
   */
  onRunCode = async (
    uri?: vscode.Uri,
    _arg?: { groupId: number },
    selectionOnly?: boolean
  ): Promise<void> => {
    assertDefined(this._connectionController, 'connectionController');

    if (uri == null) {
      uri = vscode.window.activeTextEditor?.document.uri;
    }

    assertDefined(uri, 'uri');

    const editor = await getEditorForUri(uri);
    const connectionState =
      await this._connectionController.getOrCreateConnection(uri);

    if (isInstanceOf(connectionState, DhService)) {
      await connectionState?.runEditorCode(editor, selectionOnly === true);
    }
  };

  /**
   * Run selected code in editor for given uri.
   * @param uri
   * @param arg
   */
  onRunSelectedCode = async (
    uri?: vscode.Uri,
    arg?: { groupId: number }
  ): Promise<void> => {
    this.onRunCode(uri, arg, true);
  };

  /**
   * Start a server.
   */
  onStartServer = async (): Promise<void> => {
    await this._pipServerController?.startServer();
  };

  /**
   * Stop a server.
   * @param value
   */
  onStopServer = async (value: ServerState): Promise<void> => {
    await this._pipServerController?.stopServer(value.url);
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
