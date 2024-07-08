import * as vscode from 'vscode';
import type { dh as DhcType } from '../dh/dhc-types';
import { hasErrorCode } from '../util/typeUtils';
import { ConnectionAndSession } from '../common';
import { formatTimestamp } from '../util';
import { PanelFocusManager } from './PanelFocusManager';
import { EventDispatcher } from './EventDispatcher';
import { PanelRegistry } from './PanelRegistry';

/* eslint-disable @typescript-eslint/naming-convention */
const icons = {
  Figure: '📈',
  'deephaven.plot.express.DeephavenFigure': '📈',
  Table: '⬜',
  'deephaven.ui.Element': '✨',
} as const;
type IconType = keyof typeof icons;
/* eslint-enable @typescript-eslint/naming-convention */

// Common command result types shared by DHC and DHE
type ChangesBase = {
  removed: Partial<DhcType.ide.VariableDefinition>[];
  created: Partial<DhcType.ide.VariableDefinition>[];
  updated: Partial<DhcType.ide.VariableDefinition>[];
};
type CommandResultBase = {
  changes: ChangesBase;
  error: string;
};

export abstract class DhService<
  TDH,
  TClient
> extends EventDispatcher<'disconnect'> {
  constructor(
    serverUrl: string,
    panelRegistry: PanelRegistry,
    outputChannel: vscode.OutputChannel
  ) {
    super();

    this.serverUrl = serverUrl;
    this.panelRegistry = panelRegistry;
    this.outputChannel = outputChannel;
  }

  public readonly serverUrl: string;
  protected readonly subscriptions: (() => void)[] = [];

  protected outputChannel: vscode.OutputChannel;
  private panelRegistry: PanelRegistry;
  private cachedCreateClient: Promise<TClient> | null = null;
  private cachedCreateSession: Promise<ConnectionAndSession<
    DhcType.IdeConnection,
    DhcType.IdeSession
  > | null> | null = null;
  private cachedInitApi: Promise<TDH> | null = null;

  protected dh: TDH | null = null;
  protected cn: DhcType.IdeConnection | null = null;
  protected client: TClient | null = null;
  protected session: DhcType.IdeSession | null = null;

  protected abstract initApi(): Promise<TDH>;
  protected abstract createClient(dh: TDH): Promise<TClient>;
  protected abstract createSession(
    dh: TDH,
    client: TClient
  ): Promise<ConnectionAndSession<
    DhcType.IdeConnection,
    DhcType.IdeSession
  > | null>;
  protected abstract getPanelHtml(title: string): string;
  protected abstract handlePanelMessage(
    message: {
      id: string;
      message: string;
    },
    postResponseMessage: (response: unknown) => void
  ): Promise<void>;

  private clearCaches(): void {
    this.cachedCreateClient = null;
    this.cachedCreateSession = null;
    this.cachedInitApi = null;
    this.client = null;
    this.cn = null;
    this.dh = null;
    this.session = null;

    this.subscriptions.forEach(dispose => dispose());
  }

  public get isInitialized(): boolean {
    return this.cachedInitApi != null;
  }

  public async initDh(): Promise<boolean> {
    try {
      if (this.cachedInitApi == null) {
        this.outputChannel.appendLine(
          `Initializing Deephaven API...: ${this.serverUrl}`
        );
        this.cachedInitApi = this.initApi();
      }
      this.dh = await this.cachedInitApi;

      this.outputChannel.appendLine(
        `Initialized Deephaven API: ${this.serverUrl}`
      );
    } catch (err) {
      this.clearCaches();
      console.error(err);
      this.outputChannel.appendLine(
        `Failed to initialize Deephaven API${err == null ? '.' : `: ${err}`}`
      );
      vscode.window.showErrorMessage('Failed to initialize Deephaven API');
      return false;
    }

    if (this.cachedCreateClient == null) {
      this.outputChannel.appendLine('Creating client...');
      this.cachedCreateClient = this.createClient(this.dh);
    }
    this.client = await this.cachedCreateClient;

    if (this.cachedCreateSession == null) {
      this.outputChannel.appendLine('Creating session...');
      this.cachedCreateSession = this.createSession(this.dh, this.client);

      const { cn = null, session = null } =
        (await this.cachedCreateSession) ?? {};

      // TODO: Use constant event name
      if (cn != null) {
        this.subscriptions.push(
          cn.addEventListener('disconnect', () => {
            this.clearCaches();

            vscode.window.showInformationMessage(
              `Disconnected from Deephaven server: ${this.serverUrl}`
            );

            this.dispatchEvent('disconnect');
          })
        );
      }

      if (session != null) {
        session.onLogMessage(logItem => {
          // TODO: Should this pull log level from config somewhere?
          if (logItem.logLevel !== 'INFO') {
            const date = new Date(logItem.micros / 1000);
            const timestamp = formatTimestamp(date);

            this.outputChannel.append(
              `${timestamp} ${logItem.logLevel} ${logItem.message}`
            );
          }
        });
      }
    }

    const { cn = null, session = null } =
      (await this.cachedCreateSession) ?? {};

    this.cn = cn;
    this.session = session;

    if (this.cn == null || this.session == null) {
      this.clearCaches();

      vscode.window.showErrorMessage(
        `Failed to create Deephaven session: ${this.serverUrl}`
      );

      return false;
    } else {
      vscode.window.showInformationMessage(
        `Created Deephaven session: ${this.serverUrl}`
      );

      return true;
    }
  }

  public async runEditorCode(
    editor: vscode.TextEditor,
    selectionOnly = false
  ): Promise<void> {
    if (editor.document.languageId !== 'python') {
      // This should not actually happen
      console.log(`languageId '${editor.document.languageId}' not supported.`);
      return;
    }

    // this.outputChannel.appendLine(
    //   `Sending${selectionOnly ? ' selected' : ''} code to: ${this.serverUrl}`
    // );

    if (this.session == null) {
      await this.initDh();
    }

    if (this.session == null) {
      return;
    }

    const selectionRange =
      selectionOnly && editor.selection
        ? new vscode.Range(
            editor.selection.start.line,
            0,
            editor.selection.end.line,
            editor.document.lineAt(editor.selection.end.line).text.length
          )
        : undefined;

    const text = editor.document.getText(selectionRange);

    console.log('Sending text to dh:', text);

    let result: CommandResultBase;
    let error: string | null = null;

    try {
      result = await this.session.runCode(text);
      error = result.error;
    } catch (err) {
      error = String(err);

      // Grpc UNAUTHENTICATED code. This should not generally happen since we
      // clear the caches on connection disconnect
      if (hasErrorCode(err, 16)) {
        this.clearCaches();
        vscode.window.showErrorMessage(
          'Session is no longer invalid. Please re-run the command to reconnect.'
        );
        return;
      }
    }

    if (error) {
      console.error(error);
      this.outputChannel.show(true);
      this.outputChannel.appendLine(error);
      vscode.window.showErrorMessage(
        'An error occurred when running a command'
      );

      return;
    }

    const changed = [...result!.changes.created, ...result!.changes.updated];

    let lastPanel: vscode.WebviewPanel | null = null;

    changed.forEach(({ title = 'Unknown', type }, i) => {
      const icon = icons[type as IconType] ?? type;
      this.outputChannel.appendLine(`${icon} ${title}`);

      // Don't show panels for variables starting with '_'
      if (title.startsWith('_')) {
        return;
      }

      if (!this.panelRegistry.has(title)) {
        const panel = vscode.window.createWebviewPanel(
          'dhPanel', // Identifies the type of the webview. Used internally
          title,
          { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
          {
            enableScripts: true,
            retainContextWhenHidden: true,
          }
        );

        this.panelRegistry.set(title, panel);

        // If panel gets disposed, remove it from the caches
        panel.onDidDispose(() => {
          this.panelRegistry.delete(title);
        });

        // See @deprecated comment in PanelFocusManager.onDidChangeViewState
        // Ensure focus is not stolen when panel is loaded
        // panel.onDidChangeViewState(
        //   this.panelFocusManager.handleOnDidChangeViewState(panel)
        // );
      }

      const panel = this.panelRegistry.get(title)!;
      lastPanel = panel;

      // See @deprecated comment in PanelFocusManager.onDidChangeViewState
      // Ensure focus is not stolen when panel is loaded
      // this.panelFocusManager.initialize(panel);

      panel.webview.html = this.getPanelHtml(title);

      // TODO: This seems to be subscribing multiple times. Need to see if we
      // can move it inside of the panel creation block
      panel.webview.onDidReceiveMessage(({ data }) => {
        this.handlePanelMessage(
          data,
          this.panelRegistry
            .get(title)!
            .webview.postMessage.bind(this.panelRegistry.get(title)!.webview)
        );
      });

      lastPanel?.reveal();
    });
  }
}

export default DhService;
