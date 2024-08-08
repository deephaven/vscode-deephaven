import * as vscode from 'vscode';
import { Disposable } from '../common';
import { DhService } from './DhService';
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
import { RunCommandCodeLensProvider } from './RunCommandCodeLensProvider';
import { DhServiceRegistry } from './DhServiceRegistry';
import DhcService from './DhcService';
import {
  DOWNLOAD_LOGS_CMD,
  RUN_CODE_COMMAND,
  RUN_SELECTION_COMMAND,
  SELECT_CONNECTION_COMMAND,
} from '../common';

const logger = new Logger('ExtensionController');

export class ExtensionController implements Disposable {
  constructor(private context: vscode.ExtensionContext) {
    this.initializeDiagnostics();
    this.initializeConfig();
    this.initializeCodeLenses();
    this.initializeOutputChannelsAndLogger();
    this.initializeDHServiceRegistry();
    this.initializeTempDirectory();
    this.initializeConnectionOptions();
    this.initializeConnectionStatusBarItem();

    this.registerCommands();

    logger.info(
      'Congratulations, your extension "vscode-deephaven" is now active!'
    );
    this.outputChannel?.appendLine('Deephaven extension activated');
  }

  dispose(): Promise<void> {
    return this.clearConnection();
  }

  selectedConnectionUrl: string | null = null;
  selectedDhService: DhService | null = null;
  dhcServiceRegistry: DhServiceRegistry<DhcService> | null = null;

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
    this.connectionOptions = createConnectionOptions();

    // Update connection options when configuration changes
    vscode.workspace.onDidChangeConfiguration(
      () => {
        this.connectionOptions = createConnectionOptions();
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

    // Toggle visibility of connection status bar item based on whether the
    // languageid is supported by DH
    vscode.window.onDidChangeActiveTextEditor(
      this.updateConnectionStatusBarItemVisibility,
      null,
      this.context.subscriptions
    );

    vscode.workspace.onDidChangeConfiguration(
      this.updateConnectionStatusBarItemVisibility,
      null,
      this.context.subscriptions
    );

    // Handle scenarios such as languageId change within an already open document
    vscode.workspace.onDidOpenTextDocument(
      this.updateConnectionStatusBarItemVisibility,
      null,
      this.context.subscriptions
    );
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
  ): Promise<DhService | null> => {
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
   * Register commands for the extension.
   */
  registerCommands = (): void => {
    const downloadLogsCmd = vscode.commands.registerCommand(
      DOWNLOAD_LOGS_CMD,
      this.onDownloadLogs
    );

    /** Run all code in active editor */
    const runCodeCmd = vscode.commands.registerCommand(
      RUN_CODE_COMMAND,
      async (uri: vscode.Uri, _arg: { groupId: number }) => {
        const editor = await getEditorForUri(uri);
        const dhService = await this.getActiveDhService(
          true,
          editor.document.languageId
        );
        dhService?.runEditorCode(editor);
      }
    );

    /** Run selected code in active editor */
    const runSelectionCmd = vscode.commands.registerCommand(
      RUN_SELECTION_COMMAND,
      async (uri: vscode.Uri, _arg: { groupId: number }) => {
        const editor = await getEditorForUri(uri);
        const dhService = await this.getActiveDhService(
          true,
          editor.document.languageId
        );
        dhService?.runEditorCode(editor, true);
      }
    );

    /** Select connection to run scripts against */
    const selectConnectionCmd = vscode.commands.registerCommand(
      SELECT_CONNECTION_COMMAND,
      async () => {
        const dhService = await this.getActiveDhService(false);

        const result = await createConnectionQuickPick(
          this.connectionOptions,
          dhService?.serverUrl
        );
        if (!result) {
          return;
        }

        this.onConnectionSelected(result.url);
      }
    );

    this.context.subscriptions.push(
      downloadLogsCmd,
      runCodeCmd,
      runSelectionCmd,
      selectConnectionCmd
    );
  };
}
