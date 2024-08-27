import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { hasErrorCode } from '../util/typeUtils';
import type {
  ConnectionAndSession,
  ConsoleType,
  IDhService,
  IToastService,
} from '../types';
import {
  ExtendedMap,
  formatTimestamp,
  getCombinedSelectedLinesText,
  isAggregateError,
  Logger,
  NoConsoleTypesError,
  parseServerError,
} from '../util';
import { EventDispatcher } from './EventDispatcher';

const logger = new Logger('DhService');

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

export abstract class DhService<TDH = unknown, TClient = unknown>
  extends EventDispatcher<'disconnect'>
  implements IDhService<TDH, TClient>
{
  constructor(
    serverUrl: URL,
    panelRegistry: ExtendedMap<string, vscode.WebviewPanel>,
    diagnosticsCollection: vscode.DiagnosticCollection,
    outputChannel: vscode.OutputChannel,
    toaster: IToastService
  ) {
    super();

    this.serverUrl = serverUrl;
    this.panelRegistry = panelRegistry;
    this.diagnosticsCollection = diagnosticsCollection;
    this.outputChannel = outputChannel;
    this.toaster = toaster;
  }

  public readonly serverUrl: URL;
  protected readonly subscriptions: (() => void)[] = [];

  protected readonly outputChannel: vscode.OutputChannel;
  protected readonly toaster: IToastService;
  private readonly panelRegistry: ExtendedMap<string, vscode.WebviewPanel>;
  private readonly diagnosticsCollection: vscode.DiagnosticCollection;
  private cachedCreateClient: Promise<TClient> | null = null;
  private cachedCreateSession: Promise<
    ConnectionAndSession<DhcType.IdeConnection, DhcType.IdeSession>
  > | null = null;
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
  ): Promise<ConnectionAndSession<DhcType.IdeConnection, DhcType.IdeSession>>;
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

    if (this.cn != null) {
      this.cn.close();
      this.dispatchEvent('disconnect', this.serverUrl);
    }
    this.cn = null;

    this.dh = null;
    this.session = null;

    this.subscriptions.forEach(dispose => dispose());
  }

  public async dispose(): Promise<void> {
    this.clearCaches();
  }

  protected getToastErrorMessage(
    err: unknown,
    defaultErrorMessage: string
  ): string {
    if (err instanceof NoConsoleTypesError) {
      return `No console types available for server: ${this.serverUrl}`;
    }

    if (isAggregateError(err)) {
      return `Failed to connect to server with code: ${err.code} ${this.serverUrl}`;
    }

    return defaultErrorMessage;
  }

  public get isInitialized(): boolean {
    return this.cachedInitApi != null;
  }

  public get isConnected(): boolean {
    return this.dh != null && this.cn != null && this.session != null;
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
      logger.error(err);
      this.outputChannel.appendLine(
        `Failed to initialize Deephaven API${err == null ? '.' : `: ${err}`}`
      );
      const toastMessage = this.getToastErrorMessage(
        err,
        'Failed to initialize Deephaven API'
      );
      this.toaster.error(toastMessage);
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

      try {
        const { cn, session } = await this.cachedCreateSession;

        // TODO: Use constant 'disconnect' event name
        this.subscriptions.push(
          cn.addEventListener('disconnect', () => {
            this.clearCaches();
          })
        );

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
      } catch (err) {}
    }

    try {
      const { cn, session } = await this.cachedCreateSession;
      this.cn = cn;
      this.session = session;
    } catch (err) {
      const toastMessage = this.getToastErrorMessage(
        err,
        `Failed to create Deephaven session: ${this.serverUrl}`
      );

      this.toaster.error(toastMessage);
    }

    if (this.cn == null || this.session == null) {
      this.clearCaches();

      return false;
    } else {
      this.toaster.info(`Created Deephaven session: ${this.serverUrl}`);

      return true;
    }
  }

  public async runEditorCode(
    editor: vscode.TextEditor,
    selectionOnly = false
  ): Promise<void> {
    // Clear previous diagnostics when cmd starts running
    this.diagnosticsCollection.set(editor.document.uri, []);

    if (this.session == null) {
      await this.initDh();
    }

    if (this.cn == null || this.session == null) {
      return;
    }

    const [consoleType] = await this.cn.getConsoleTypes();

    if (consoleType !== editor.document.languageId) {
      this.toaster.error(
        `This connection does not support '${editor.document.languageId}'.`
      );
      return;
    }

    const text = selectionOnly
      ? getCombinedSelectedLinesText(editor)
      : editor.document.getText();

    logger.info('Sending text to dh:', text);

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
        this.toaster.error(
          'Session is no longer invalid. Please re-run the command to reconnect.'
        );
        return;
      }
    }

    if (error) {
      logger.error(error);
      this.outputChannel.show(true);
      this.outputChannel.appendLine(error);
      this.toaster.error('An error occurred when running a command');

      if (editor.document.languageId === 'python') {
        const { line, value } = parseServerError(error);

        if (line != null) {
          // If selectionOnly is true, the line number in the error will be
          // relative to the selection (Python line numbers are 1 based. vscode
          // line numbers are zero based.)
          const fileLine =
            (selectionOnly ? line + editor.selection.start.line : line) - 1;

          // There seems to be an error for certain Python versions where line
          // numbers are shown as -1. In such cases, we'll just mark the first
          // token on the first line to at least flag the file as having an error.
          const startLine = Math.max(0, fileLine);

          // Zero length will flag a token instead of a line
          const lineLength =
            fileLine < 0 ? 0 : editor.document.lineAt(fileLine).text.length;

          // Diagnostic representing the line of code that produced the server error
          const diagnostic: vscode.Diagnostic = {
            message: value == null ? error : `${value}\n${error}`,
            severity: vscode.DiagnosticSeverity.Error,
            range: new vscode.Range(startLine, 0, startLine, lineLength),
            source: 'deephaven',
          };

          this.diagnosticsCollection.set(editor.document.uri, [diagnostic]);
        }
      }

      return;
    }

    const changed = [...result!.changes.created, ...result!.changes.updated];

    // Have to set this with type assertion since TypeScript can't figure out
    // assignments inside of the `forEach` and will treat `lastPanel` as `null`.
    let lastPanel = null as vscode.WebviewPanel | null;

    changed.forEach(({ title = 'Unknown', type }) => {
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

      const panel = this.panelRegistry.getOrThrow(title);
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
            .webview.postMessage.bind(
              this.panelRegistry.getOrThrow(title).webview
            )
        );
      });
    });

    lastPanel?.reveal();
  }

  getConsoleTypes = async (): Promise<Set<ConsoleType>> => {
    if (this.cn == null) {
      return new Set();
    }

    const consoleTypes = await (this.cn.getConsoleTypes() as Promise<
      ConsoleType[]
    >);

    return new Set(consoleTypes);
  };

  supportsConsoleType = async (consoleType: ConsoleType): Promise<boolean> => {
    const consoleTypes = await this.getConsoleTypes();
    return consoleTypes.has(consoleType);
  };
}

export default DhService;
