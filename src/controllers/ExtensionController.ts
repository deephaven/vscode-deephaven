import * as vscode from 'vscode';
import * as os from 'os';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import type {
  ClientListenerEvent,
  EnterpriseDhType as DheType,
} from '@deephaven-enterprise/jsapi-types';
import {
  createClient as createDheClient,
  getWsUrl,
  type UnauthenticatedClient as DheUnauthenticatedClient,
} from '@deephaven-enterprise/auth-nodejs';
import { NodeHttp2gRPCTransport } from '@deephaven/jsapi-nodejs';
import {
  ADD_REMOTE_FILE_SOURCE_CMD,
  CLEAR_SECRET_STORAGE_CMD,
  CREATE_NEW_TEXT_DOC_CMD,
  DELETE_VARIABLE_CMD,
  DOWNLOAD_LOGS_CMD,
  GENERATE_REQUIREMENTS_TXT_CMD,
  OPEN_IN_BROWSER_CMD,
  REFRESH_PANELS_TREE_CMD,
  REFRESH_REMOTE_IMPORT_SOURCE_TREE_CMD,
  REFRESH_SERVER_CONNECTION_TREE_CMD,
  REFRESH_SERVER_TREE_CMD,
  REMOVE_REMOTE_FILE_SOURCE_CMD,
  RUN_CODE_COMMAND,
  RUN_MARKDOWN_CODEBLOCK_CMD,
  RUN_SELECTION_COMMAND,
  SEARCH_CONNECTIONS_CMD,
  SEARCH_PANELS_CMD,
  START_SERVER_CMD,
  STOP_SERVER_CMD,
  VIEW_ID,
  type RunCodeCmdArgs,
  type RunMarkdownCodeblockCmdArgs,
  type RunSelectionCmdArgs,
  type ViewID,
} from '../common';
import {
  deserializeRange,
  getEditorForUri,
  getTempDir,
  isInstanceOf,
  isSerializedRange,
  isSupportedLanguageId,
  LogFileHandler,
  Logger,
  OutputChannelWithHistory,
  parseMarkdownCodeblocks,
  sanitizeGRPCLogMessageArgs,
  saveLogFiles,
  serializeRefreshToken,
  Toaster,
  uniqueId,
  URLMap,
  withResolvers,
} from '../util';
import {
  RemoteImportSourceTreeProvider,
  RunCommandCodeLensProvider,
  ServerTreeProvider,
  ServerConnectionTreeProvider,
  ServerConnectionPanelTreeProvider,
  runSelectedLinesHoverProvider,
  RunMarkdownCodeBlockCodeLensProvider,
  SamlAuthProvider,
  RunMarkdownCodeBlockHoverProvider,
  CreateQueryViewProvider,
} from '../providers';
import {
  CoreJsApiCache,
  DhcService,
  DheJsApiCache,
  DheService,
  DheServiceCache,
  FilteredWorkspace,
  RemoteFileSourceService,
  PanelService,
  ParsedDocumentCache,
  PYTHON_FILE_PATTERN,
  SecretService,
  ServerManager,
} from '../services';
import type {
  IDisposable,
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
  WorkerURL,
  UniqueID,
  SerializedRange,
  CodeBlock,
  IInteractiveConsoleQueryFactory,
  ConsoleType,
  DheAuthenticatedClientWrapper,
  DheUnauthenticatedClientWrapper,
  RemoteImportSourceTreeView,
  VariableDefintion,
  RemoteImportSourceTreeElement,
  RemoteImportSourceTreeFolderElement,
} from '../types';
import { ServerConnectionTreeDragAndDropController } from './ServerConnectionTreeDragAndDropController';
import { ConnectionController } from './ConnectionController';
import { PipServerController } from './PipServerController';
import { PanelController } from './PanelController';
import { UserLoginController } from './UserLoginController';
import {
  assertDefined,
  type QuerySerial,
  type SerializableRefreshToken,
} from '../shared';

const logger = new Logger('ExtensionController');

export class ExtensionController implements IDisposable {
  constructor(context: vscode.ExtensionContext, configService: IConfigService) {
    this._context = context;
    this._config = configService;
    this._instanceId = uniqueId(8);
    this._version = this._context.extension.packageJSON.version;

    const envInfo = {
      /* eslint-disable @typescript-eslint/naming-convention */
      'VS Code version': vscode.version,
      'Deephaven Extension version': this._version,
      'Deephaven Extension instanceId': this._instanceId,
      'Electron version': process.versions.electron,
      'Chromium version': process.versions.chrome,
      'Node version': process.versions.node,
      /* eslint-enable @typescript-eslint/naming-convention */
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      version: os.version(),
      totalmem: os.totalmem(),
      freemem: os.freemem(),
      cpus: os.cpus(),
      uptime: os.uptime(),
    };

    this._envInfoText = Object.entries(envInfo)
      .map(([key, value]) => `\t${key}: ${JSON.stringify(value)}`)
      .join('\n');
  }

  private readonly _context: vscode.ExtensionContext;
  private readonly _config: IConfigService;
  private readonly _instanceId: UniqueID;
  private readonly _version: string;
  private readonly _envInfoText: string;

  private _codeBlockCache: ParsedDocumentCache<CodeBlock[]> | null = null;
  private _connectionController: ConnectionController | null = null;
  private _coreClientCache: URLMap<
    CoreAuthenticatedClient & IDisposable
  > | null = null;
  private _coreClientFactory: ICoreClientFactory | null = null;
  private _coreJsApiCache: IAsyncCacheService<URL, typeof DhcType> | null =
    null;
  private _dheClientCache: URLMap<DheAuthenticatedClientWrapper> | null = null;
  private _dheClientFactory: IDheClientFactory | null = null;
  private _dheServiceCache: IAsyncCacheService<URL, IDheService> | null = null;
  private _interactiveConsoleQueryFactory: IInteractiveConsoleQueryFactory | null =
    null;
  private _logFileHandler: LogFileHandler | null = null;
  private _panelController: PanelController | null = null;
  private _panelService: IPanelService | null = null;
  private _pipServerController: PipServerController | null = null;
  private _dhcServiceFactory: IDhcServiceFactory | null = null;
  private _dheJsApiCache: IAsyncCacheService<URL, DheType> | null = null;
  private _dheServiceFactory: IDheServiceFactory | null = null;
  private _pythonWorkspace: FilteredWorkspace | null = null;
  private _remoteFileSourceService: RemoteFileSourceService | null = null;
  private _secretService: ISecretService | null = null;
  private _serverManager: IServerManager | null = null;
  private _userLoginController: UserLoginController | null = null;

  // Tree providers
  private _serverTreeProvider: ServerTreeProvider | null = null;
  private _serverConnectionTreeProvider: ServerConnectionTreeProvider | null =
    null;
  private _serverConnectionPanelTreeProvider: ServerConnectionPanelTreeProvider | null =
    null;
  private _remoteImportSourceTreeProvider: RemoteImportSourceTreeProvider | null =
    null;

  // Tree views
  private _serverTreeView: ServerTreeView | null = null;
  private _serverConnectionTreeView: ServerConnectionTreeView | null = null;
  private _serverConnectionPanelTreeView: ServerConnectionPanelTreeView | null =
    null;
  private _remoteImportSourceTreeView: RemoteImportSourceTreeView | null = null;

  // Web views
  private _createQueryViewProvider: CreateQueryViewProvider | null = null;

  private _pythonDiagnostics: vscode.DiagnosticCollection | null = null;
  private _outputChannel: vscode.OutputChannel | null = null;
  private _outputChannelDebug: OutputChannelWithHistory | null = null;
  private _toaster: IToastService | null = null;

  async dispose(): Promise<void> {}

  activate = (): void => {
    this.initializeMessaging();

    logger.info(`Activating Deephaven extension\n${this._envInfoText}`);

    this.initializeDiagnostics();
    this.initializeConfig();
    this.initializeSecrets();
    this.initializeDocumentCaches();
    this.initializeCodeLenses();
    this.initializeHoverProviders();
    this.initializeRemoteFileSourcing();
    this.initializeServerManager();
    this.initializeAuthProviders();
    this.initializeTempDirectory();
    this.initializeWebViews();
    this.initializeServerUpdates();
    this.initializeConnectionController();
    this.initializePanelController();
    this.initializePipServerController();
    this.initializeUserLoginController();
    this.initializeCommands();

    this._context.subscriptions.push(NodeHttp2gRPCTransport);

    const message = `Activated Deephaven Extension.`;

    logger.info(message);
    this._outputChannel?.appendLine(message);
  };

  deactivate = (): void => {
    logger.info(`Deactivating Deephaven extension`);
  };

  /**
   * Initialize authentication providers.
   */
  initializeAuthProviders = (): void => {
    const samlAuthProvider = new SamlAuthProvider(this._context);
    this._context.subscriptions.push(samlAuthProvider);
  };

  /**
   * Initialize document caches.
   */
  initializeDocumentCaches = (): void => {
    this._codeBlockCache = new ParsedDocumentCache(parseMarkdownCodeblocks);
  };

  /**
   * Initialize code lenses for running Deephaven code.
   */
  initializeCodeLenses = (): void => {
    assertDefined(this._codeBlockCache, 'codeBlockCache');

    const codelensProvider = new RunCommandCodeLensProvider();
    const markdownCodelensProvider = new RunMarkdownCodeBlockCodeLensProvider(
      this._codeBlockCache
    );

    this._context.subscriptions.push(
      codelensProvider,
      vscode.languages.registerCodeLensProvider('groovy', codelensProvider),
      vscode.languages.registerCodeLensProvider('python', codelensProvider),
      vscode.languages.registerCodeLensProvider(
        'markdown',
        markdownCodelensProvider
      )
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
    assertDefined(this._createQueryViewProvider, 'createQueryViewProvider');
    assertDefined(this._serverManager, 'serverManager');
    assertDefined(this._outputChannel, 'outputChannel');
    assertDefined(this._toaster, 'toaster');

    this._connectionController = new ConnectionController(
      this._context,
      this._createQueryViewProvider,
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

    this._context.subscriptions.push(this._pipServerController);
  };

  /**
   * Initialize services needed for remote file sourcing.
   */
  initializeRemoteFileSourcing = (): void => {
    assertDefined(this._toaster, 'toaster');
    this._pythonWorkspace = new FilteredWorkspace(
      PYTHON_FILE_PATTERN,
      this._toaster
    );
    this._context.subscriptions.push(this._pythonWorkspace);

    this._remoteFileSourceService = new RemoteFileSourceService(
      this._pythonWorkspace
    );
    this._context.subscriptions.push(this._remoteFileSourceService);
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
    assertDefined(this._codeBlockCache, 'codeBlockCache');

    vscode.languages.registerHoverProvider(
      'groovy',
      runSelectedLinesHoverProvider
    );

    vscode.languages.registerHoverProvider(
      'python',
      runSelectedLinesHoverProvider
    );

    vscode.languages.registerHoverProvider(
      'markdown',
      new RunMarkdownCodeBlockHoverProvider(this._codeBlockCache)
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

    this._logFileHandler = new LogFileHandler(this._instanceId, this._context);
    Logger.handlers.add(this._logFileHandler);

    const gRPCOutputChannelHandler = Logger.createOutputChannelHandler(
      this._outputChannelDebug
    );
    NodeHttp2gRPCTransport.onLogMessage((logLevel, ...args: unknown[]) => {
      args = sanitizeGRPCLogMessageArgs(args);
      gRPCOutputChannelHandler(logLevel)('[NodeHttp2gRPCTransport]', ...args);
    });

    this._toaster = new Toaster();

    this._context.subscriptions.push(
      this._logFileHandler,
      this._outputChannel,
      this._outputChannelDebug
    );
  };

  initializeServerManager = (): void => {
    assertDefined(this._pythonDiagnostics, 'pythonDiagnostics');
    assertDefined(this._outputChannel, 'outputChannel');
    assertDefined(this._remoteFileSourceService, 'remoteFileSourceService');
    assertDefined(this._secretService, 'secretService');
    assertDefined(this._toaster, 'toaster');

    this._coreJsApiCache = new CoreJsApiCache();
    this._context.subscriptions.push(this._coreJsApiCache);

    this._dheJsApiCache = new DheJsApiCache();
    this._context.subscriptions.push(this._dheJsApiCache);

    this._coreClientFactory = async (
      url: URL
    ): Promise<CoreUnauthenticatedClient & IDisposable> => {
      assertDefined(this._coreJsApiCache, 'coreJsApiCache');

      const workerInfo = await this._serverManager?.getWorkerInfo(
        url as WorkerURL
      );
      const envoyPrefix = workerInfo?.envoyPrefix;
      const urlStr = String(workerInfo?.grpcUrl ?? url).replace(/\/$/, '');

      const isElectronFetchEnabled = this._config.isElectronFetchEnabled();

      logger.debug(
        `Electron fetch is ${isElectronFetchEnabled ? 'enabled' : 'disabled'}.${isElectronFetchEnabled ? '' : ' Using NodeHttp2gRPCTransport.'}`
      );

      const options: DhcType.ConnectOptions = {
        // Set `debug` to true to see debug logs for gRPC transport
        debug: false,
        // If VS Code `http.electronFetch` setting is enabled, we shouldn't need
        // the gRPC transport. If it's disabled, we need to use the gRPC transport
        // so that we can provide a working NodeJS version of http2.
        transportFactory: isElectronFetchEnabled
          ? undefined
          : NodeHttp2gRPCTransport.factory,
      };

      if (envoyPrefix != null) {
        options.headers = {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          'envoy-prefix': envoyPrefix,
        };
      }

      const dhc = await this._coreJsApiCache.get(url);

      const client = new dhc.CoreClient(
        urlStr,
        options
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
    ): Promise<DheUnauthenticatedClientWrapper> => {
      assertDefined(this._dheJsApiCache, 'dheJsApiCache');
      const dhe = await this._dheJsApiCache.get(url);

      const client: DheUnauthenticatedClient = await createDheClient(
        dhe,
        getWsUrl(url)
      );

      const wResolvers = withResolvers<SerializableRefreshToken | null>();
      let { promise: refreshTokenSerializedPromise } = wResolvers;
      let resolve: (typeof wResolvers)['resolve'] | null = wResolvers.resolve;

      const refreshTokenSubscription = client.addEventListener(
        iris.Client.EVENT_REFRESH_TOKEN_UPDATED,
        async (event: ClientListenerEvent<DhcType.RefreshToken>) => {
          const serializedToken = serializeRefreshToken(event.detail);

          // The `refreshTokenSerialized` property will return a Promise to the
          // latest serialized refresh token. We use `withResolvers` for the
          // first token to ensure if the property is called before login, the
          // consumer can wait for the first token. For subsequent tokens, we
          // replace the Promise with an already resolved one so that callers
          // just get it immediately.
          resolve?.(serializedToken);

          // technically we could keep calling resolve since it's a noop, but
          // nulling it to make it clear this is no longer the mechanism
          // providing the value.
          resolve = null;

          refreshTokenSerializedPromise = Promise.resolve(serializedToken);
        }
      );

      return {
        client,
        /**
         * Get a Promise for the latest refresh token. If the first token has not
         * been received yet, the Promise will resolve once it is received.
         */
        get refreshTokenSerialized(): Promise<SerializableRefreshToken | null> {
          return refreshTokenSerializedPromise;
        },
        dispose: async (): Promise<void> => {
          client.disconnect();
          refreshTokenSubscription();
        },
      };
    };

    this._coreClientCache = new URLMap<CoreAuthenticatedClient & IDisposable>();
    this._context.subscriptions.push(this._coreClientCache);

    this._dheClientCache = new URLMap<DheAuthenticatedClientWrapper>();
    this._context.subscriptions.push(this._dheClientCache);

    this._panelService = new PanelService();
    this._context.subscriptions.push(this._panelService);

    this._dhcServiceFactory = DhcService.factory(
      this._coreClientCache,
      this._pythonDiagnostics,
      this._remoteFileSourceService,
      this._outputChannel,
      this._panelService,
      this._secretService,
      this._toaster
    );

    this._interactiveConsoleQueryFactory = async (
      serverUrl: URL,
      tagId: UniqueID,
      consoleType?: ConsoleType
    ): Promise<QuerySerial | null> => {
      assertDefined(this._createQueryViewProvider, 'createQueryViewProvider');
      return this._createQueryViewProvider.createQuery(
        serverUrl,
        tagId,
        consoleType
      );
    };

    this._dheServiceFactory = DheService.factory(
      this._config,
      this._dheClientCache,
      this._dheJsApiCache,
      this._interactiveConsoleQueryFactory,
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
      this.onGenerateRequirementsTxt
    );

    /** Open server in browser */
    this.registerCommand(OPEN_IN_BROWSER_CMD, this.onOpenInBrowser);

    /** Run all code in active editor */
    this.registerCommand(RUN_CODE_COMMAND, this.onRunCode);

    /** Run Markdown codeblock */
    this.registerCommand(
      RUN_MARKDOWN_CODEBLOCK_CMD,
      this.onRunMarkdownCodeblock
    );

    /** Run selected code in active editor */
    this.registerCommand(RUN_SELECTION_COMMAND, this.onRunSelectedCode);

    /** Refresh server tree */
    this.registerCommand(REFRESH_SERVER_TREE_CMD, this.onRefreshServerStatus);

    /** Refresh server connection tree */
    this.registerCommand(
      REFRESH_SERVER_CONNECTION_TREE_CMD,
      this.onRefreshServerStatus
    );

    /** Refresh variable panels tree */
    this.registerCommand(REFRESH_PANELS_TREE_CMD, this.onRefreshServerStatus);

    /** Remote import source tree */
    this.registerCommand(
      REFRESH_REMOTE_IMPORT_SOURCE_TREE_CMD,
      this.onRefreshRemoteImportSourceTree
    );
    this.registerCommand(
      ADD_REMOTE_FILE_SOURCE_CMD,
      this.onAddRemoteFileSource
    );
    this.registerCommand(
      REMOVE_REMOTE_FILE_SOURCE_CMD,
      this.onRemoveRemoteFileSource
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

    this.registerCommand(DELETE_VARIABLE_CMD, this.onDeleteVariable);

    /** Start a server */
    this.registerCommand(START_SERVER_CMD, this.onStartServer);

    /** Stop a server */
    this.registerCommand(STOP_SERVER_CMD, this.onStopServer);
  };

  /**
   * Register web views for the extension.
   */
  initializeWebViews = (): void => {
    assertDefined(this._dheClientCache, 'dheClientCache');
    assertDefined(this._pythonWorkspace, 'pythonWorkspace');
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

    // Create Query View
    this._createQueryViewProvider = new CreateQueryViewProvider(
      this._context,
      this._dheClientCache
    );
    this._context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        VIEW_ID.createQuery,
        this._createQueryViewProvider,
        {
          webviewOptions: {
            retainContextWhenHidden: true,
          },
        }
      )
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

    // Remote import source tree
    this._remoteImportSourceTreeProvider = new RemoteImportSourceTreeProvider(
      this._pythonWorkspace
    );
    this._remoteImportSourceTreeView =
      vscode.window.createTreeView<RemoteImportSourceTreeElement>(
        VIEW_ID.remoteImportSourceTree,
        {
          showCollapseAll: true,
          treeDataProvider: this._remoteImportSourceTreeProvider,
        }
      );

    this._context.subscriptions.push(
      this._serverTreeView,
      this._serverConnectionTreeView,
      this._serverConnectionPanelTreeView,
      this._remoteImportSourceTreeView,
      this._serverTreeProvider,
      this._serverConnectionTreeProvider,
      this._serverConnectionPanelTreeProvider,
      this._remoteImportSourceTreeProvider
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
    this._pipServerController?.syncManagedServers();
  };

  onDeleteVariable = async (
    urlAndVariable: [URL, VariableDefintion] | undefined
  ): Promise<void> => {
    // Sometimes view/item/context commands pass undefined instead of a value.
    // Just ignore.
    if (urlAndVariable == null) {
      return;
    }

    const [url, variable] = urlAndVariable;
    const connectionState = this._serverManager?.getConnection(url);
    if (!isInstanceOf(connectionState, DhcService)) {
      return;
    }

    await connectionState.deleteVariable(variable);
  };

  onAddRemoteFileSource = async (
    folderElementOrUri:
      | RemoteImportSourceTreeFolderElement
      | vscode.Uri
      | undefined
  ): Promise<void> => {
    // Sometimes view/item/context commands pass undefined instead of a value.
    // Just ignore.
    if (folderElementOrUri == null) {
      return;
    }

    assertDefined(this._pythonWorkspace, 'pythonWorkspace');

    await this._pythonWorkspace.refresh();

    const uri =
      folderElementOrUri instanceof vscode.Uri
        ? folderElementOrUri
        : folderElementOrUri.uri;

    this._pythonWorkspace.markFolder(uri);
  };

  onRemoveRemoteFileSource = async (
    folderElementOrUri:
      | RemoteImportSourceTreeFolderElement
      | vscode.Uri
      | undefined
  ): Promise<void> => {
    // Sometimes view/item/context commands pass undefined instead of a value.
    // Just ignore.
    if (folderElementOrUri == null) {
      return;
    }

    assertDefined(this._pythonWorkspace, 'pythonWorkspace');

    await this._pythonWorkspace.refresh();

    const uri =
      folderElementOrUri instanceof vscode.Uri
        ? folderElementOrUri
        : folderElementOrUri.uri;
    this._pythonWorkspace.unmarkFolder(uri);
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
  onCreateNewDocument = async (
    dhService: IDhcService | undefined
  ): Promise<void> => {
    // Sometimes view/item/context commands pass undefined instead of a value.
    // Just ignore.
    if (dhService == null) {
      return;
    }

    const language = (await dhService.supportsConsoleType('python'))
      ? 'python'
      : 'groovy';

    const doc = await vscode.workspace.openTextDocument({
      language,
    });

    const editor = await vscode.window.showTextDocument(doc);

    this._serverManager?.setEditorConnection(
      editor.document.uri,
      editor.document.languageId,
      dhService
    );
  };

  /**
   * Handle download logs command
   */
  onDownloadLogs = async (): Promise<void> => {
    assertDefined(this._logFileHandler, 'logFileHandler');
    assertDefined(this._outputChannelDebug, 'outputChannelDebug');
    assertDefined(this._toaster, 'toaster');

    const uri = await saveLogFiles(this._logFileHandler.logDirectory);

    if (uri != null) {
      this._toaster.info(`Downloaded logs to ${uri.fsPath}`);

      await vscode.commands.executeCommand(
        'revealFileInOS',
        vscode.Uri.parse(uri.fsPath)
      );
    }
  };

  /**
   * Handle generating requirements.txt command
   */
  onGenerateRequirementsTxt = async (
    connectionState: ConnectionState | undefined
  ): Promise<void> => {
    // Sometimes view/item/context commands pass undefined instead of a value.
    // Just ignore.
    if (connectionState == null) {
      return;
    }

    if (!isInstanceOf(connectionState, DhcService)) {
      throw new Error('Connection is not a DHC service');
    }

    await connectionState.generateRequirementsTxt();
  };

  onOpenInBrowser = async (
    serverState: ServerState | undefined
  ): Promise<void> => {
    // Sometimes view/item/context commands pass undefined instead of a value.
    // Just ignore.
    if (serverState == null) {
      return;
    }

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

  onRefreshRemoteImportSourceTree = async (): Promise<void> => {
    this._pythonWorkspace?.refresh();
    this._remoteImportSourceTreeProvider?.refresh();
  };

  onRefreshServerStatus = async (): Promise<void> => {
    await this._pipServerController?.syncManagedServers({ forceCheck: true });
    await this._serverManager?.updateStatus();
  };

  /**
   * Run code block in markdown.
   * @param uri The uri of the editor
   * @param languageId The languageId of the code block
   * @param range The range of the code block
   */
  onRunMarkdownCodeblock: (
    ...args: RunMarkdownCodeblockCmdArgs
  ) => Promise<void> = async (
    uri: vscode.Uri,
    languageId: string,
    range: vscode.Range | SerializedRange
  ): Promise<void> => {
    if (isSerializedRange(range)) {
      range = deserializeRange(range);
    }
    this.onRunCode(uri, undefined, [range], languageId);
  };

  /**
   * Run all code in editor for given uri. Note that the parameters are
   * optional since the RUN_CODE_COMMAND can be called from the CMD palette
   * which doesn't provide parameters.
   * @param uri The uri of the editor
   * @param _arg Ignored arg that is passed in from `editor/context` and
   * `editor/title/run` actions.
   * @param constrainTo Optional arg to constrain the code to run.
   * - If 'selection', run only selected code in the editor.
   * - If `undefined`, run all code in the editor.
   * - If an array of vscode.Range, run only the code in the ranges (Note that
   *   partial lines will be expanded to include the full line content).
   * @param languageId Optional languageId to run the code as. If none provided,
   * use the languageId of the editor.
   */
  onRunCode: (...args: RunCodeCmdArgs) => Promise<void> = async (
    uri?: vscode.Uri,
    _arg?: { groupId: number },
    constrainTo?: 'selection' | vscode.Range[],
    languageId?: string
  ): Promise<void> => {
    assertDefined(this._connectionController, 'connectionController');

    if (uri == null) {
      uri = vscode.window.activeTextEditor?.document.uri;
    }

    assertDefined(uri, 'uri');

    const editor = await getEditorForUri(uri);
    if (languageId == null) {
      languageId = editor.document.languageId;
    }

    const connectionState =
      await this._connectionController.getOrCreateConnection(uri, languageId);

    if (isInstanceOf(connectionState, DhcService)) {
      const ranges: readonly vscode.Range[] | undefined =
        constrainTo === 'selection' ? editor.selections : constrainTo;

      await connectionState?.runCode(editor.document, languageId, ranges);
    }
  };

  /**
   * Run selected code in editor for given uri. Note that the parameters are
   * optional since the RUN_SELECTION_COMMAND can be called from the CMD
   * palette which doesn't provide parameters.
   * @param uri The uri of the editor
   * @param _arg Ignored arg that is passed in from `editor/context` and
   * `editor/title/run` actions.
   * @param languageId Optional languageId to run the code as
   */
  onRunSelectedCode: (...args: RunSelectionCmdArgs) => Promise<void> = async (
    uri?: vscode.Uri,
    _arg?: { groupId: number },
    languageId?: string
  ): Promise<void> => {
    this.onRunCode(uri, undefined, 'selection', languageId);
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
  onStopServer = async (value: ServerState | undefined): Promise<void> => {
    // Sometimes view/item/context commands pass undefined instead of a value.
    // Just ignore.
    if (value == null) {
      return;
    }

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
