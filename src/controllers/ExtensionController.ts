import * as vscode from 'vscode';
import {
  CONNECT_TO_SERVER_CMD,
  DISCONNECT_FROM_SERVER_CMD,
  Disposable,
  DOWNLOAD_LOGS_CMD,
  RUN_CODE_COMMAND,
  RUN_SELECTION_COMMAND,
  SELECT_CONNECTION_COMMAND,
  ServerState,
  VIEW_ID,
} from '../common';
import {
  assertDefined,
  ConnectionOption,
  createConnectionOptions,
  createConnectionQuickPick,
  createConnectStatusBarItem,
  ExtendedMap,
  getEditorForUri,
  getTempDir,
  Logger,
  OutputChannelWithHistory,
  shouldShowConnectionStatusBarItem,
  Toaster,
  updateConnectionStatusBarItem,
} from '../util';
import {
  DhcServiceFactory,
  DhServiceRegistry,
  DhcService,
  RunCommandCodeLensProvider,
  ServerManager,
  ServerTreeProvider,
  ServerConnectionTreeProvider,
} from '../services';
import {
  IConfigService,
  IDhService,
  IDhServiceFactory,
  IServerManager,
} from '../types';

const logger = new Logger('ExtensionController');

export class ExtensionController implements Disposable {
  constructor(context: vscode.ExtensionContext, configService: IConfigService) {
    this.context = context;
    this.config = configService;

    this.initializeDiagnostics();
    this.initializeConfig();
    this.initializeCodeLenses();
    this.initializeOutputChannelsAndLogger();
    this.initializeDHServiceRegistry();
    this.initializeDhServiceFactories();
    this.initializeTempDirectory();
    this.initializeConnectionOptions();
    this.initializeConnectionStatusBarItem();
    this.initializeCommands();
    this.initializeWebViews();

    logger.info(
      'Congratulations, your extension "vscode-deephaven" is now active!'
    );
    this.outputChannel?.appendLine('Deephaven extension activated');
  }

  dispose(): Promise<void> {
    return this.clearConnection();
  }

  context: vscode.ExtensionContext;
  config: IConfigService;
  selectedConnectionUrl: string | null = null;
  selectedDhService: IDhService | null = null;
  dhcServiceRegistry: DhServiceRegistry<DhcService> | null = null;
  dhcServiceFactory: IDhServiceFactory | null = null;
  serverManager: IServerManager | null = null;

  connectionOptions: ConnectionOption[] = [];
  connectStatusBarItem: vscode.StatusBarItem | null = null;

  pythonDiagnostics: vscode.DiagnosticCollection | null = null;
  outputChannel: vscode.OutputChannel | null = null;
  outputChannelDebug: OutputChannelWithHistory | null = null;
  toaster = new Toaster();

  /**
   * Initialize code lenses for running Deephaven code.
   */
  initializeCodeLenses = (): void => {
    const codelensProvider = new RunCommandCodeLensProvider();

    this.context.subscriptions.push(
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
        this.outputChannel?.appendLine('Configuration changed');
      },
      null,
      this.context.subscriptions
    );
  };

  /**
   * Initialize connection options.
   */
  initializeConnectionOptions = (): void => {
    this.connectionOptions = createConnectionOptions(
      this.config.getCoreServers()
    );

    // Update connection options when configuration changes
    vscode.workspace.onDidChangeConfiguration(
      () => {
        this.connectionOptions = createConnectionOptions(
          this.config.getCoreServers()
        );
      },
      null,
      this.context.subscriptions
    );
  };

  /**
   * Initialize connection status bar item.
   */
  initializeConnectionStatusBarItem = (): void => {
    this.connectStatusBarItem = createConnectStatusBarItem(false);
    this.context.subscriptions.push(this.connectStatusBarItem);

    this.updateConnectionStatusBarItemVisibility();

    const args = [
      this.updateConnectionStatusBarItemVisibility,
      null,
      this.context.subscriptions,
    ] as const;

    vscode.window.onDidChangeActiveTextEditor(...args);
    vscode.workspace.onDidChangeConfiguration(...args);
    // Handle scenarios such as languageId change within an already open document
    vscode.workspace.onDidOpenTextDocument(...args);
  };

  /**
   * Initialize diagnostics collections.
   */
  initializeDiagnostics = (): void => {
    this.pythonDiagnostics =
      vscode.languages.createDiagnosticCollection('python');

    // Clear diagnostics on save
    vscode.workspace.onDidSaveTextDocument(
      doc => {
        this.pythonDiagnostics?.set(doc.uri, []);
      },
      null,
      this.context.subscriptions
    );
  };

  /**
   * Initialize output channels and Logger.
   */
  initializeOutputChannelsAndLogger = (): void => {
    this.outputChannel = vscode.window.createOutputChannel('Deephaven', 'log');
    this.outputChannelDebug = new OutputChannelWithHistory(
      this.context,
      vscode.window.createOutputChannel('Deephaven Debug', 'log')
    );

    Logger.addConsoleHandler();
    Logger.addOutputChannelHandler(this.outputChannelDebug);

    this.context.subscriptions.push(
      this.outputChannel,
      this.outputChannelDebug
    );
  };

  initializeDhServiceFactories = (): void => {
    assertDefined(this.pythonDiagnostics, 'pythonDiagnostics');
    assertDefined(this.outputChannel, 'outputChannel');

    this.dhcServiceFactory = new DhcServiceFactory(
      new ExtendedMap<string, vscode.WebviewPanel>(),
      this.pythonDiagnostics,
      this.outputChannel,
      this.toaster
    );
  };

  /**
   * Initialize DH service registry.
   */
  initializeDHServiceRegistry = (): void => {
    assertDefined(this.pythonDiagnostics, 'pythonDiagnostics');
    assertDefined(this.outputChannel, 'outputChannel');

    this.dhcServiceRegistry = new DhServiceRegistry(
      DhcService,
      new ExtendedMap<string, vscode.WebviewPanel>(),
      this.pythonDiagnostics,
      this.outputChannel,
      this.toaster
    );

    this.dhcServiceRegistry.addEventListener('disconnect', serverUrl => {
      this.toaster.info(`Disconnected from Deephaven server: ${serverUrl}`);
      this.clearConnection();
    });

    this.context.subscriptions.push(this.dhcServiceRegistry);
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
    /** Create server connection */
    this.registerCommand(CONNECT_TO_SERVER_CMD, this.onConnectToServer);

    /** Disconnect from server */
    this.registerCommand(
      DISCONNECT_FROM_SERVER_CMD,
      this.onDisconnectFromServer
    );

    /** Download logs and open in editor */
    this.registerCommand(DOWNLOAD_LOGS_CMD, this.onDownloadLogs);

    /** Run all code in active editor */
    this.registerCommand(RUN_CODE_COMMAND, this.onRunCode);

    /** Run selected code in active editor */
    this.registerCommand(RUN_SELECTION_COMMAND, this.onRunSelectedCode);

    /** Select connection to run scripts against */
    this.registerCommand(SELECT_CONNECTION_COMMAND, this.onSelectConnection);
  };

  /**
   * Register web views for the extension.
   */
  initializeWebViews = (): void => {
    assertDefined(this.dhcServiceFactory, 'dhcServiceFactory');
    assertDefined(this.outputChannel, 'outputChannel');

    this.serverManager = new ServerManager(
      this.config,
      this.dhcServiceFactory,
      this.outputChannel
    );

    const serverTreeProvider = new ServerTreeProvider(this.serverManager);
    const serversView = vscode.window.registerTreeDataProvider(
      VIEW_ID.serverTree,
      serverTreeProvider
    );

    const connectionsView = vscode.window.registerTreeDataProvider(
      VIEW_ID.serverConnectionTree,
      new ServerConnectionTreeProvider(this.serverManager)
    );

    this.context.subscriptions.push(
      this.serverManager,
      serversView,
      connectionsView
    );
  };

  /*
   * Clear connection data
   */
  clearConnection = async (): Promise<void> => {
    this.selectedConnectionUrl = null;
    this.selectedDhService = null;

    updateConnectionStatusBarItem(this.connectStatusBarItem, 'disconnected');

    await this.dhcServiceRegistry?.clearCache();
  };

  /**
   * Get currently active DH service.
   * @autoActivate If true, auto-activate a service if none is active.
   * @languageId Optional language id of the DH service to find.
   */
  getActiveDhService = async (
    autoActivate: boolean,
    languageId?: string
  ): Promise<IDhService | null> => {
    if (!autoActivate || languageId == null) {
      return this.selectedDhService;
    }

    const selectedConsoleType = this.connectionOptions.find(
      c => c.url === this.selectedConnectionUrl
    )?.consoleType;

    // If console type of current selection doesn't match the language id, look
    // for the first one that does and select it.
    if (selectedConsoleType !== languageId) {
      const toConnectUrl =
        this.connectionOptions.find(c => c.consoleType === languageId)?.url ??
        null;

      if (toConnectUrl == null) {
        this.toaster.error(
          `No Deephaven server configured for console type: '${languageId}'`
        );
      }

      await this.onConnectionSelected(toConnectUrl);
    }

    return this.selectedDhService;
  };

  /**
   * Handle connecting to a server
   */
  onConnectToServer = async (serverState: ServerState): Promise<void> => {
    this.serverManager?.connectToServer(serverState.url);
  };

  /**
   * Handle disconnecting from a server.
   */
  onDisconnectFromServer = async (dhService: IDhService): Promise<void> => {
    this.serverManager?.disconnectFromServer(dhService.serverUrl);
  };

  /**
   * Handle connection selection
   */
  onConnectionSelected = async (
    connectionUrl: string | null
  ): Promise<void> => {
    assertDefined(this.dhcServiceRegistry, 'dhcServiceRegistry');

    // Show the output panel whenever we select a connection. This is a little
    // friendlier to the user instead of it opening when the extension activates
    // for cases where the user isn't working with DH server
    this.outputChannel?.show(true);

    this.outputChannel?.appendLine(
      connectionUrl == null
        ? 'Disconnecting'
        : `Selecting connection: ${connectionUrl}`
    );

    const option = this.connectionOptions.find(
      option => option.url === connectionUrl
    );

    // Disconnect option was selected, or connectionUrl that no longer exists
    if (connectionUrl == null || !option) {
      this.clearConnection();
      this.updateConnectionStatusBarItemVisibility();
      return;
    }

    updateConnectionStatusBarItem(
      this.connectStatusBarItem,
      'connecting',
      option
    );

    this.selectedConnectionUrl = connectionUrl;
    this.selectedDhService = await this.dhcServiceRegistry.get(
      this.selectedConnectionUrl
    );

    if (
      this.selectedDhService.isInitialized ||
      (await this.selectedDhService.initDh())
    ) {
      updateConnectionStatusBarItem(
        this.connectStatusBarItem,
        'connected',
        option
      );

      this.outputChannel?.appendLine(
        `Initialized: ${this.selectedConnectionUrl}`
      );
    } else {
      this.clearConnection();
    }

    this.updateConnectionStatusBarItemVisibility();
  };

  /**
   * Handle download logs command
   */
  onDownloadLogs = async (): Promise<void> => {
    assertDefined(this.outputChannelDebug, 'outputChannelDebug');

    const uri = await this.outputChannelDebug.downloadHistoryToFile();

    if (uri != null) {
      this.toaster.info(`Downloaded logs to ${uri.fsPath}`);
      vscode.window.showTextDocument(uri);
    }
  };

  /**
   * Run all code in editor for given uri.
   * @param uri
   */
  onRunCode = async (uri: vscode.Uri): Promise<void> => {
    const editor = await getEditorForUri(uri);
    const dhService = await this.getActiveDhService(
      true,
      editor.document.languageId
    );
    dhService?.runEditorCode(editor);
  };

  /**
   * Run selected code in editor for given uri.
   * @param uri
   */
  onRunSelectedCode = async (uri: vscode.Uri): Promise<void> => {
    const editor = await getEditorForUri(uri);
    const dhService = await this.getActiveDhService(
      true,
      editor.document.languageId
    );
    dhService?.runEditorCode(editor, true);
  };

  /**
   * Handle connection selection.
   */
  onSelectConnection = async (): Promise<void> => {
    const dhService = await this.getActiveDhService(false);

    const result = await createConnectionQuickPick(
      this.connectionOptions,
      dhService?.serverUrl
    );
    if (!result) {
      return;
    }

    this.onConnectionSelected(result.url);
  };

  /**
   * Update status bar item visibility.
   */
  updateConnectionStatusBarItemVisibility = (): void => {
    if (
      shouldShowConnectionStatusBarItem(
        this.connectionOptions,
        this.selectedDhService != null
      )
    ) {
      this.connectStatusBarItem?.show();
    } else {
      this.connectStatusBarItem?.hide();
    }
  };

  /**
   * Register a command and add it's subscription to the context.
   */
  registerCommand = (
    ...args: Parameters<typeof vscode.commands.registerCommand>
  ): void => {
    const cmd = vscode.commands.registerCommand(...args);
    this.context.subscriptions.push(cmd);
  };
}
