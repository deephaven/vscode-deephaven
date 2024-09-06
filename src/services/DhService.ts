import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { hasErrorCode } from '../util/typeUtils';
import type {
  ConnectionAndSession,
  ConsoleType,
  IDhService,
  IToastService,
  VariableChanges,
  VariableDefintion,
} from '../types';
import {
  formatTimestamp,
  getCombinedSelectedLinesText,
  isAggregateError,
  Logger,
  NoConsoleTypesError,
  parseServerError,
} from '../util';
import { OPEN_VARIABLE_PANELS_CMD, VARIABLE_UNICODE_ICONS } from '../common';

const logger = new Logger('DhService');

export abstract class DhService<TDH = unknown, TClient = unknown>
  implements IDhService<TDH, TClient>
{
  constructor(
    serverUrl: URL,
    diagnosticsCollection: vscode.DiagnosticCollection,
    outputChannel: vscode.OutputChannel,
    toaster: IToastService
  ) {
    this.serverUrl = serverUrl;
    this.diagnosticsCollection = diagnosticsCollection;
    this.outputChannel = outputChannel;
    this.toaster = toaster;
  }

  private readonly _onDidDisconnect = new vscode.EventEmitter<URL>();
  readonly onDidDisconnect = this._onDidDisconnect.event;

  public readonly serverUrl: URL;
  protected readonly subscriptions: (() => void)[] = [];

  protected readonly outputChannel: vscode.OutputChannel;
  protected readonly toaster: IToastService;
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

  private clearCaches(): void {
    this.cachedCreateClient = null;
    this.cachedCreateSession = null;
    this.cachedInitApi = null;
    this.client = null;

    if (this.cn != null) {
      this.cn.close();
      this._onDidDisconnect.fire(this.serverUrl);
    }
    this.cn = null;

    this.dh = null;
    this.session = null;

    this.subscriptions.forEach(dispose => dispose());
  }

  public async dispose(): Promise<void> {
    this.clearCaches();
    this._onDidDisconnect.dispose();
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

        cn.subscribeToFieldUpdates(changes => {
          this.panelService.updateVariables(
            this.serverUrl,
            changes as VariableChanges
          );
        });

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

    let result: DhcType.ide.CommandResult;
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

    const changed = [
      ...result!.changes.created,
      ...result!.changes.updated,
      // Type assertion is necessary to make use of our more specific branded types
      // coming from the less specific types defined in the jsapi-types package.
    ] as VariableDefintion[];

    changed.forEach(({ title = 'Unknown', type }) => {
      const icon = VARIABLE_UNICODE_ICONS[type] ?? type;
      this.outputChannel.appendLine(`${icon} ${title}`);
    });

    const showVariables = changed.filter(v => !v.title.startsWith('_'));

    vscode.commands.executeCommand(
      OPEN_VARIABLE_PANELS_CMD,
      this.serverUrl,
      showVariables
    );
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
