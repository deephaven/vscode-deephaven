import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import type { EnterpriseDhType as DheType } from '@deephaven-enterprise/jsapi-types';
import {
  CLEAR_SECRET_STORAGE_CMD,
  CREATE_NEW_TEXT_DOC_CMD,
  DOWNLOAD_LOGS_CMD,
  GENERATE_REQUIREMENTS_TXT_CMD,
  OPEN_IN_BROWSER_CMD,
  REFRESH_SERVER_CONNECTION_TREE_CMD,
  REFRESH_SERVER_TREE_CMD,
  RUN_CODE_COMMAND,
  RUN_SELECTION_COMMAND,
  SEARCH_CONNECTIONS_CMD,
  SEARCH_PANELS_CMD,
  START_SERVER_CMD,
  STOP_SERVER_CMD,
  VIEW_ID,
  type ViewID,
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
  DheJsApiCache,
  DheService,
  DheServiceCache,
  DhcService,
  PanelService,
  SecretService,
  ServerManager,
  URLMap,
  CoreJsApiCache,
} from '../services';
import type {
  Disposable,
  IAsyncCacheService,
  IConfigService,
  IDheClientFactory,
  IDheService,
  IDheServiceFactory,
  IDhcService,
  IDhcServiceFactory,
  IPanelService,
  ISecretService,
  IServerManager,
  IToastService,
  ServerConnectionPanelNode,
  ServerConnectionPanelTreeView,
  ServerConnectionTreeView,
  ServerState,
  ServerTreeView,
  CoreAuthenticatedClient,
  ICoreClientFactory,
  CoreUnauthenticatedClient,
  ConnectionState,
} from '../types';
import { ServerConnectionTreeDragAndDropController } from './ServerConnectionTreeDragAndDropController';
import { ConnectionController } from './ConnectionController';
import { PipServerController } from './PipServerController';
import { PanelController } from './PanelController';
import { UserLoginController } from './UserLoginController';
import {
  createClient as createDheClient,
  getWsUrl,
  type AuthenticatedClient as DheAuthenticatedClient,
  type UnauthenticatedClient as DheUnauthenticatedClient,
} from '@deephaven-enterprise/auth-nodejs';

const logger = new Logger('ExtensionController');

export class ExtensionController implements Disposable {
  constructor(context: vscode.ExtensionContext, configService: IConfigService) {
    this._context = context;
    this._config = configService;

    this.initializeDiagnostics();
    this.initializeConfig();
    this.initializeSecrets();
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
  private _coreClientCache: URLMap<
    CoreAuthenticatedClient & Disposable
  > | null = null;
  private _coreClientFactory: ICoreClientFactory | null = null;
  private _coreJsApiCache: IAsyncCacheService<URL, typeof DhcType> | null =
    null;
  private _dheClientCache: URLMap<DheAuthenticatedClient & Disposable> | null =
    null;
  private _dheClientFactory: IDheClientFactory | null = null;
  private _dheServiceCache: IAsyncCacheService<URL, IDheService> | null = null;
  private _panelController: PanelController | null = null;
  private _panelService: IPanelService | null = null;
  private _pipServerController: PipServerController | null = null;
  private _dhcServiceFactory: IDhcServiceFactory | null = null;
  private _dheJsApiCache: IAsyncCacheService<URL, DheType> | null = null;
  private _dheServiceFactory: IDheServiceFactory | null = null;
  private _secretService: ISecretService | null = null;
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
      codelensProvider,
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
   * Initialize secrets.
   */
  initializeSecrets = (): void => {
    this._secretService = new SecretService(this._context.secrets);
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
    assertDefined(this._panelService, 'panelService');
    assertDefined(this._serverManager, 'serverManager');

    this._panelController = new PanelController(
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
    assertDefined(this._coreClientCache, 'coreClientCache');
    assertDefined(this._coreClientFactory, 'coreClientFactory');
    assertDefined(this._coreJsApiCache, 'coreJsApiCache');
    assertDefined(this._dheClientCache, 'dheClientCache');
    assertDefined(this._dheClientFactory, 'dheClientFactory');
    assertDefined(this._secretService, 'secretService');
    assertDefined(this._serverManager, 'serverManager');
    assertDefined(this._toaster, 'toaster');

    this._userLoginController = new UserLoginController(
      this._coreClientCache,
      this._coreClientFactory,
      this._coreJsApiCache,
      this._dheClientCache,
      this._dheClientFactory,
      this._secretService,
      this._serverManager,
      this._toaster
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
    assertDefined(this._secretService, 'secretService');
    assertDefined(this._toaster, 'toaster');

    this._coreJsApiCache = new CoreJsApiCache();
    this._context.subscriptions.push(this._coreJsApiCache);

    this._dheJsApiCache = new DheJsApiCache();
    this._context.subscriptions.push(this._dheJsApiCache);

    this._coreClientFactory = async (
      url: URL
    ): Promise<CoreUnauthenticatedClient & Disposable> => {
      assertDefined(this._coreJsApiCache, 'coreJsApiCache');
      const dhc = await this._coreJsApiCache.get(url);

      const client = new dhc.CoreClient(
        url.toString()
      ) as CoreUnauthenticatedClient;

      // Attach a dispose method so that client caches can dispose of the client
      return Object.assign(client, {
        dispose: async () => {
          client.disconnect();
        },
      });
    };

    this._dheClientFactory = async (
      url: URL
    ): Promise<DheUnauthenticatedClient & Disposable> => {
      assertDefined(this._dheJsApiCache, 'dheJsApiCache');
      const dhe = await this._dheJsApiCache.get(url);

      const client = await createDheClient(dhe, getWsUrl(url));

      // Attach a dispose method so that client caches can dispose of the client
      return Object.assign(client, {
        dispose: async () => {
          client.disconnect();
        },
      });
    };

    this._coreClientCache = new URLMap<CoreAuthenticatedClient & Disposable>();
    this._context.subscriptions.push(this._coreClientCache);

    this._dheClientCache = new URLMap<DheAuthenticatedClient & Disposable>();
    this._context.subscriptions.push(this._dheClientCache);

    this._panelService = new PanelService();
    this._context.subscriptions.push(this._panelService);

    this._dhcServiceFactory = DhcService.factory(
      this._coreClientCache,
      this._panelService,
      this._pythonDiagnostics,
      this._outputChannel,
      this._secretService,
      this._toaster
    );

    this._dheServiceFactory = DheService.factory(
      this._config,
      this._dheClientCache,
      this._dheJsApiCache,
      this._toaster
    );

    this._dheServiceCache = new DheServiceCache(this._dheServiceFactory);
    this._context.subscriptions.push(this._dheServiceCache);

    this._serverManager = new ServerManager(
      this._config,
      this._coreClientCache,
      this._dhcServiceFactory,
      this._dheClientCache,
      this._dheServiceCache,
      this._outputChannel,
      this._secretService,
      this._toaster
    );
    this._context.subscriptions.push(this._serverManager);

    this._serverManager.onDidDisconnect(
      serverUrl => {
        this._panelService?.clearServerData(serverUrl);
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

    /** Clear secret storage */
    this.registerCommand(CLEAR_SECRET_STORAGE_CMD, this.onClearSecretStorage);

    /** Create new document */
    this.registerCommand(CREATE_NEW_TEXT_DOC_CMD, this.onCreateNewDocument);

    /** Download logs and open in editor */
    this.registerCommand(DOWNLOAD_LOGS_CMD, this.onDownloadLogs);

    /** Generate requirements.txt */
    this.registerCommand(
      GENERATE_REQUIREMENTS_TXT_CMD,
      this.onRegisterRequirementsTxt
    );

    /** Open server in browser */
    this.registerCommand(OPEN_IN_BROWSER_CMD, this.onOpenInBrowser);

    /** Run all code in active editor */
    this.registerCommand(RUN_CODE_COMMAND, this.onRunCode);

    /** Run selected code in active editor */
    this.registerCommand(RUN_SELECTION_COMMAND, this.onRunSelectedCode);

    /** Refresh server tree */
    this.registerCommand(REFRESH_SERVER_TREE_CMD, this.onRefreshServerStatus);

    /** Refresh server connection tree */
    this.registerCommand(
      REFRESH_SERVER_CONNECTION_TREE_CMD,
      this.onRefreshServerStatus
    );

    /** Search connections */
    this.registerCommand(
      SEARCH_CONNECTIONS_CMD,
      this.onSearchTree,
      VIEW_ID.serverConnectionTree
    );

    /** Search variable panels */
    this.registerCommand(
      SEARCH_PANELS_CMD,
      this.onSearchTree,
      VIEW_ID.serverConnectionPanelTree
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
      this._serverConnectionPanelTreeView,
      this._serverTreeProvider,
      this._serverConnectionTreeProvider,
      this._serverConnectionPanelTreeProvider
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
   * Handle clearing secret storage.
   */
  onClearSecretStorage = async (): Promise<void> => {
    await this._secretService?.clearStorage();
    this._toaster?.info('Stored secrets have been removed.');
  };

  /**
   * Create a new text document based on the given connection capabilities.
   * @param dhService
   */
  onCreateNewDocument = async (dhService: IDhcService): Promise<void> => {
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

  /**
   * Handle generating requirements.txt command
   */
  onRegisterRequirementsTxt = async (
    connectionState: ConnectionState
  ): Promise<void> => {
    if (isInstanceOf(connectionState, DhcService)) {
      // TODO:
    }
  };

  onOpenInBrowser = async (serverState: ServerState): Promise<void> => {
    const psk = await this._secretService?.getPsk(serverState.url);
    const serverUrl = new URL(serverState.url);

    if (psk != null) {
      serverUrl.searchParams.set('psk', psk);
    }

    vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.parse(serverUrl.toString())
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

    if (isInstanceOf(connectionState, DhcService)) {
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
   * Open search input for tree panel.
   */
  onSearchTree = async function (this: ViewID): Promise<void> {
    vscode.commands.executeCommand(`${this}.focus`);
    vscode.commands.executeCommand('list.find');
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
  registerCommand = <TThis = any>(
    command: string,
    callback: (this: TThis, ...args: any[]) => any,
    thisArg?: TThis
  ): void => {
    const cmd = vscode.commands.registerCommand(command, callback, thisArg);
    this._context.subscriptions.push(cmd);
  };
}
