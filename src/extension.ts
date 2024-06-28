import * as vscode from 'vscode';
import {
  ConnectionOption,
  createConnectStatusBarItem,
  createConnectTextAndTooltip,
  createConnectionOptions,
  createConnectionQuickPick,
  getTempDir,
} from './util';
import { DhcService, PanelRegistry } from './services';
import { DhServiceRegistry } from './services';
import {
  RUN_CODE_COMMAND,
  RUN_SELECTION_COMMAND,
  SELECT_CONNECTION_COMMAND,
  STATUS_BAR_CONNECTING_TEXT,
  STATUS_BAR_DISCONNECTED_TEXT,
} from './common';

export function activate(context: vscode.ExtensionContext) {
  console.log(
    'Congratulations, your extension "vscode-deephaven" is now active!'
  );

  let selectedConnectionUrl: string | null = null;
  let selectedDhService: DhcService | null = null;
  let connectionOptions = createConnectionOptions();

  const outputChannel = vscode.window.createOutputChannel('Deephaven', 'log');
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

  const dhcServiceRegistry = new DhServiceRegistry(
    DhcService,
    new PanelRegistry(),
    outputChannel
  );

  dhcServiceRegistry.addEventListener('disconnect', () => {
    clearConnection();
  });

  /*
   * Clear connection data
   */
  function clearConnection() {
    selectedConnectionUrl = null;
    selectedDhService = null;
    const { text, tooltip } = createConnectTextAndTooltip('disconnected');
    connectStatusBarItem.text = text;
    connectStatusBarItem.tooltip = tooltip;
    dhcServiceRegistry.clearCache();
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
  const { runCodeCmd, runSelectionCmd, selectConnectionCmd } = registerCommands(
    () => connectionOptions,
    getActiveDhService,
    onConnectionSelected
  );

  const connectStatusBarItem = createConnectStatusBarItem();

  context.subscriptions.push(
    outputChannel,
    runCodeCmd,
    runSelectionCmd,
    selectConnectionCmd,
    connectStatusBarItem
  );

  // recreate tmp dir that will be used to dowload JS Apis
  getTempDir(true /*recreate*/);

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
  onConnectionSelected: (connectionUrl: string | null) => void
) {
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

  return { runCodeCmd, runSelectionCmd, selectConnectionCmd };
}
