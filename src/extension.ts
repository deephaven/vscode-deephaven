import * as vscode from 'vscode';
import {
  ConnectionOption,
  ExtendedMap,
  createConnectStatusBarItem,
  createConnectTextAndTooltip,
  createConnectionOptions,
  createConnectionQuickPick,
  getTempDir,
  Logger,
  Toaster,
} from './util';
import { DhcService, RunCommandCodeLensProvider } from './services';
import { DhServiceRegistry } from './services';
import {
  DOWNLOAD_LOGS_CMD,
  RUN_CODE_COMMAND,
  RUN_SELECTION_COMMAND,
  SELECT_CONNECTION_COMMAND,
} from './common';
import { OutputChannelWithHistory } from './util/OutputChannelWithHistory';

const logger = new Logger('extension');

export function activate(context: vscode.ExtensionContext) {
  let selectedConnectionUrl: string | null = null;
  let selectedDhService: DhcService | null = null;
  let connectionOptions = createConnectionOptions();

  // Register code lenses for running Deephaven code
  const codelensProvider = new RunCommandCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider('groovy', codelensProvider),
    vscode.languages.registerCodeLensProvider('python', codelensProvider)
  );

  const diagnosticsCollection =
    vscode.languages.createDiagnosticCollection('python');

  const outputChannel = vscode.window.createOutputChannel('Deephaven', 'log');
  const debugOutputChannel = new OutputChannelWithHistory(
    context,
    vscode.window.createOutputChannel('Deephaven Debug', 'log')
  );
  const toaster = new Toaster();

  // Configure log handlers
  Logger.addConsoleHandler();
  Logger.addOutputChannelHandler(debugOutputChannel);

  logger.info(
    'Congratulations, your extension "vscode-deephaven" is now active!'
  );

  outputChannel.appendLine('Deephaven extension activated');

  // Update connection options when configuration changes
  vscode.workspace.onDidChangeConfiguration(
    () => {
      outputChannel.appendLine('Configuration changed');
      connectionOptions = createConnectionOptions();
    },
    null,
    context.subscriptions
  );

  // Clear diagnostics on save
  vscode.workspace.onDidSaveTextDocument(doc => {
    diagnosticsCollection.set(doc.uri, []);
  });

  const dhcServiceRegistry = new DhServiceRegistry(
    DhcService,
    new ExtendedMap<string, vscode.WebviewPanel>(),
    diagnosticsCollection,
    outputChannel,
    toaster
  );

  dhcServiceRegistry.addEventListener('disconnect', serverUrl => {
    toaster.info(`Disconnected from Deephaven server: ${serverUrl}`);
    clearConnection();
  });

  /*
   * Clear connection data
   */
  async function clearConnection() {
    selectedConnectionUrl = null;
    selectedDhService = null;
    const { text, tooltip } = createConnectTextAndTooltip('disconnected');
    connectStatusBarItem.text = text;
    connectStatusBarItem.tooltip = tooltip;
    await dhcServiceRegistry.clearCache();
  }

  /**
   * Get currently active DH service.
   * @autoActivate If true, auto-activate a service if none is active.
   */
  async function getActiveDhService(
    autoActivate: boolean
  ): Promise<DhcService | null> {
    if (autoActivate && !selectedConnectionUrl) {
      const defaultConnection = connectionOptions[0];
      await onConnectionSelected(defaultConnection.url);
    }

    return selectedDhService;
  }

  /** Register extension commands */
  const { downloadLogsCmd, runCodeCmd, runSelectionCmd, selectConnectionCmd } =
    registerCommands(
      () => connectionOptions,
      getActiveDhService,
      onConnectionSelected,
      onDownloadLogs
    );

  const connectStatusBarItem = createConnectStatusBarItem();

  context.subscriptions.push(
    debugOutputChannel,
    downloadLogsCmd,
    dhcServiceRegistry,
    outputChannel,
    runCodeCmd,
    runSelectionCmd,
    selectConnectionCmd,
    connectStatusBarItem
  );

  // recreate tmp dir that will be used to dowload JS Apis
  getTempDir(true /*recreate*/);

  /**
   * Handle download logs command
   */
  async function onDownloadLogs() {
    const uri = await debugOutputChannel.downloadHistoryToFile();

    if (uri != null) {
      toaster.info(`Downloaded logs to ${uri.fsPath}`);
      vscode.window.showTextDocument(uri);
    }
  }

  /**
   * Handle connection selection
   */
  async function onConnectionSelected(connectionUrl: string | null) {
    // Show the output panel whenever we select a connection. This is a little
    // friendlier to the user instead of it opening when the extension activates
    // for cases where the user isn't working with DH server
    outputChannel.show(true);

    outputChannel.appendLine(
      connectionUrl == null
        ? 'Disconnecting'
        : `Selecting connection: ${connectionUrl}`
    );

    const option = connectionOptions.find(
      option => option.url === connectionUrl
    );

    // Disconnect option was selected, or connectionUrl that no longer exists
    if (connectionUrl == null || !option) {
      clearConnection();
      return;
    }

    const { text, tooltip } = createConnectTextAndTooltip('connecting', option);
    connectStatusBarItem.text = text;
    connectStatusBarItem.tooltip = tooltip;

    selectedConnectionUrl = connectionUrl;
    selectedDhService = await dhcServiceRegistry.get(selectedConnectionUrl);

    if (selectedDhService.isInitialized || (await selectedDhService.initDh())) {
      const { text, tooltip } = createConnectTextAndTooltip(
        'connected',
        option
      );
      connectStatusBarItem.text = text;
      connectStatusBarItem.tooltip = tooltip;
      outputChannel.appendLine(`Initialized: ${selectedConnectionUrl}`);
    } else {
      clearConnection();
    }
  }
}

export function deactivate() {}

async function ensureUriEditorIsActive(uri: vscode.Uri) {
  const isActive =
    uri.toString() === vscode.window.activeTextEditor?.document.uri.toString();

  // If another panel such as the output panel is active, set the document
  // for the url to active first
  if (!isActive) {
    // https://stackoverflow.com/a/64808497/20489
    await vscode.window.showTextDocument(uri, { preview: false });
  }
}

/** Register commands for the extension. */
function registerCommands(
  getConnectionOptions: () => ConnectionOption[],
  getActiveDhService: (autoActivate: boolean) => Promise<DhcService | null>,
  onConnectionSelected: (connectionUrl: string | null) => void,
  onDownloadLogs: () => void
) {
  const downloadLogsCmd = vscode.commands.registerCommand(
    DOWNLOAD_LOGS_CMD,
    onDownloadLogs
  );

  /** Run all code in active editor */
  const runCodeCmd = vscode.commands.registerCommand(
    RUN_CODE_COMMAND,
    async (uri: vscode.Uri, _arg: { groupId: number }) => {
      await ensureUriEditorIsActive(uri);

      const editor = vscode.window.activeTextEditor;

      if (editor) {
        const dhService = await getActiveDhService(true);
        dhService?.runEditorCode(editor);
      }
    }
  );

  /** Run selected code in active editor */
  const runSelectionCmd = vscode.commands.registerCommand(
    RUN_SELECTION_COMMAND,
    async (uri: vscode.Uri, _arg: { groupId: number }) => {
      await ensureUriEditorIsActive(uri);

      const editor = vscode.window.activeTextEditor;

      if (editor) {
        const dhService = await getActiveDhService(true);
        dhService?.runEditorCode(editor, true);
      }
    }
  );

  /** Select connection to run scripts against */
  const selectConnectionCmd = vscode.commands.registerCommand(
    SELECT_CONNECTION_COMMAND,
    async () => {
      const dhService = await getActiveDhService(false);

      const result = await createConnectionQuickPick(
        getConnectionOptions(),
        dhService?.serverUrl
      );
      if (!result) {
        return;
      }

      onConnectionSelected(result.url);
    }
  );

  return { downloadLogsCmd, runCodeCmd, runSelectionCmd, selectConnectionCmd };
}
