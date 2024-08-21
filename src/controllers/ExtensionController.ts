import * as vscode from 'vscode';
import {
  CONNECT_TO_SERVER_CMD,
  DISCONNECT_EDITOR_CMD,
  DISCONNECT_FROM_SERVER_CMD,
  DOWNLOAD_LOGS_CMD,
  OPEN_IN_BROWSER_CMD,
  REFRESH_SERVER_CONNECTION_TREE_CMD,
  REFRESH_SERVER_TREE_CMD,
  RUN_CODE_COMMAND,
  RUN_SELECTION_COMMAND,
  SELECT_CONNECTION_COMMAND,
  VIEW_ID,
} from '../common';
import {
  assertDefined,
  ExtendedMap,
  getEditorForUri,
  getTempDir,
  Logger,
  OutputChannelWithHistory,
  Toaster,
} from '../util';
import {
  RunCommandCodeLensProvider,
  ServerTreeProvider,
  ServerConnectionTreeProvider,
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

const logger = new Logger('ExtensionController');

export class ExtensionController implements Disposable {
  constructor(context: vscode.ExtensionContext, configService: IConfigService) {
    this.context = context;
    this.config = configService;

    this.initializeDiagnostics();
    this.initializeConfig();
    this.initializeCodeLenses();
    this.initializeMessaging();
    this.initializeServerManager();
    this.initializeTempDirectory();
    this.initializeConnectionController();
    this.initializeCommands();
    this.initializeWebViews();

    logger.info(
      'Congratulations, your extension "vscode-deephaven" is now active!'
    );
    this.outputChannel?.appendLine('Deephaven extension activated');
  }

  readonly context: vscode.ExtensionContext;
  readonly config: IConfigService;
  connectionController: ConnectionController | null = null;
  dhcServiceFactory: IDhServiceFactory | null = null;
  serverManager: IServerManager | null = null;
  serverTreeProvider: ServerTreeProvider | null = null;
  serverConnectionTreeProvider: ServerConnectionTreeProvider | null = null;
  serverTreeView: ServerTreeView | null = null;
  serverConnectionTreeView: ServerConnectionTreeView | null = null;

  pythonDiagnostics: vscode.DiagnosticCollection | null = null;
  outputChannel: vscode.OutputChannel | null = null;
  outputChannelDebug: OutputChannelWithHistory | null = null;
  toaster: IToastService | null = null;

  async dispose(): Promise<void> {}

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
   * Initialize connection controller.
   */
  initializeConnectionController = (): void => {
    assertDefined(this.serverManager, 'serverManager');
    assertDefined(this.outputChannel, 'outputChannel');
    assertDefined(this.toaster, 'toaster');

    this.connectionController = new ConnectionController(
      this.context,
      this.config,
      this.serverManager,
      this.outputChannel,
      this.toaster
    );

    this.context.subscriptions.push(this.connectionController);
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
   * Initialize output channels, Logger and Toaster.
   */
  initializeMessaging = (): void => {
    this.outputChannel = vscode.window.createOutputChannel('Deephaven', 'log');
    this.outputChannelDebug = new OutputChannelWithHistory(
      this.context,
      vscode.window.createOutputChannel('Deephaven Debug', 'log')
    );

    Logger.addConsoleHandler();
    Logger.addOutputChannelHandler(this.outputChannelDebug);

    this.toaster = new Toaster();

    this.context.subscriptions.push(
      this.outputChannel,
      this.outputChannelDebug
    );
  };

  initializeServerManager = (): void => {
    assertDefined(this.pythonDiagnostics, 'pythonDiagnostics');
    assertDefined(this.outputChannel, 'outputChannel');
    assertDefined(this.toaster, 'toaster');

    this.dhcServiceFactory = new DhcServiceFactory(
      new ExtendedMap<string, vscode.WebviewPanel>(),
      this.pythonDiagnostics,
      this.outputChannel,
      this.toaster
    );

    this.serverManager = new ServerManager(this.config, this.dhcServiceFactory);

    this.serverManager.onDidDisconnect(serverUrl => {
      this.outputChannel?.appendLine(
        `Disconnected from server: '${serverUrl}'.`
      );
    });

    vscode.workspace.onDidChangeConfiguration(
      () => {
        this.serverManager?.loadServerConfig();
      },
      undefined,
      this.context.subscriptions
    );

    // Expand to show any new editor URIs that are associated with a connection
    this.serverManager.onDidRegisterEditor(
      uri => {
        this.serverConnectionTreeView?.reveal(uri);
      },
      undefined,
      this.context.subscriptions
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
    assertDefined(this.connectionController, 'connectionController');

    /** Create server connection */
    this.registerCommand(CONNECT_TO_SERVER_CMD, this.onConnectToServer);

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
      this.connectionController.onPromptUserToSelectConnection
    );

    /** Refresh server tree */
    this.registerCommand(REFRESH_SERVER_TREE_CMD, this.onRefreshServerTree);

    /** Refresh server connection tree */
    this.registerCommand(
      REFRESH_SERVER_CONNECTION_TREE_CMD,
      this.onRefreshServerConnectionTree
    );
  };

  /**
   * Register web views for the extension.
   */
  initializeWebViews = (): void => {
    assertDefined(this.serverManager, 'serverManager');

    // Server tree
    this.serverTreeProvider = new ServerTreeProvider(this.serverManager);
    this.serverTreeView = vscode.window.createTreeView(VIEW_ID.serverTree, {
      showCollapseAll: true,
      treeDataProvider: this.serverTreeProvider,
    });

    // Connection tree
    this.serverConnectionTreeProvider = new ServerConnectionTreeProvider(
      this.serverManager
    );
    const serverConnectionTreeDragAndDropController =
      new ServerConnectionTreeDragAndDropController(this.serverManager);

    this.serverConnectionTreeView = vscode.window.createTreeView(
      VIEW_ID.serverConnectionTree,
      {
        dragAndDropController: serverConnectionTreeDragAndDropController,
        showCollapseAll: true,
        treeDataProvider: this.serverConnectionTreeProvider,
      }
    );

    this.context.subscriptions.push(
      this.serverManager,
      this.serverTreeView,
      this.serverConnectionTreeView
    );
  };

  /**
   * Handle connecting to a server
   */
  onConnectToServer = async (serverState: ServerState): Promise<void> => {
    this.serverManager?.connectToServer(serverState.url);
  };

  /**
   * Disconnect editor from active connections.
   * @param uri
   */
  onDisconnectEditor = (uri: vscode.Uri): void => {
    this.serverManager?.disconnectEditor(uri);
  };

  /**
   * Handle disconnecting from a server.
   */
  onDisconnectFromServer = async (dhService: IDhService): Promise<void> => {
    this.serverManager?.disconnectFromServer(dhService.serverUrl);
  };

  /**
   * Handle download logs command
   */
  onDownloadLogs = async (): Promise<void> => {
    assertDefined(this.outputChannelDebug, 'outputChannelDebug');
    assertDefined(this.toaster, 'toaster');

    const uri = await this.outputChannelDebug.downloadHistoryToFile();

    if (uri != null) {
      this.toaster.info(`Downloaded logs to ${uri.fsPath}`);
      vscode.window.showTextDocument(uri);
    }
  };

  onOpenInBrowser = async (serverState: ServerState): Promise<void> => {
    vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.parse(serverState.url.toString())
    );
  };

  onRefreshServerTree = (): void => {
    this.serverTreeProvider?.refresh();
  };

  onRefreshServerConnectionTree = (): void => {
    this.serverConnectionTreeProvider?.refresh();
  };

  /**
   * Run all code in editor for given uri.
   * @param uri
   */
  onRunCode = async (uri: vscode.Uri): Promise<void> => {
    assertDefined(this.connectionController, 'connectionController');

    const editor = await getEditorForUri(uri);
    const dhService =
      await this.connectionController.getOrCreateConnection(uri);
    await dhService?.runEditorCode(editor);
  };

  /**
   * Run selected code in editor for given uri.
   * @param uri
   */
  onRunSelectedCode = async (uri: vscode.Uri): Promise<void> => {
    assertDefined(this.connectionController, 'connectionController');

    const editor = await getEditorForUri(uri);
    const dhService =
      await this.connectionController.getOrCreateConnection(uri);
    await dhService?.runEditorCode(editor, true);
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
