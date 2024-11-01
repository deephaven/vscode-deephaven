import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { initDhcApi, isAggregateError } from '@deephaven/require-jsapi';
import {
  formatTimestamp,
  getCombinedSelectedLinesText,
  getTempDir,
  Logger,
  urlToDirectoryName,
} from '../util';
import {
  AUTH_HANDLER_TYPE_ANONYMOUS,
  AUTH_HANDLER_TYPE_PSK,
  initDhcSession,
  type ConnectionAndSession,
} from '../dh/dhc';
import type {
  ConsoleType,
  IDhcService,
  IPanelService,
  IToastService,
  Lazy,
  UniqueID,
  VariableChanges,
  VariableDefintion,
  VariableID,
} from '../types';
import type { URLMap } from './URLMap';
import {
  OPEN_VARIABLE_PANELS_CMD,
  REFRESH_VARIABLE_PANELS_CMD,
  VARIABLE_UNICODE_ICONS,
} from '../common';
import { NoConsoleTypesError, parseServerError } from '../dh/errorUtils';
import { hasErrorCode } from '../util/typeUtils';

const logger = new Logger('DhcService');

export class DhcService implements IDhcService {
  constructor(
    serverUrl: URL,
    coreCredentialsCache: URLMap<Lazy<DhcType.LoginCredentials>>,
    panelService: IPanelService,
    diagnosticsCollection: vscode.DiagnosticCollection,
    outputChannel: vscode.OutputChannel,
    toaster: IToastService,
    tagId?: UniqueID
  ) {
    this.coreCredentialsCache = coreCredentialsCache;
    this.serverUrl = serverUrl;
    this.panelService = panelService;
    this.diagnosticsCollection = diagnosticsCollection;
    this.outputChannel = outputChannel;
    this.toaster = toaster;
    this.tagId = tagId;
  }

  private readonly _onDidDisconnect = new vscode.EventEmitter<URL>();
  readonly onDidDisconnect = this._onDidDisconnect.event;

  public readonly serverUrl: URL;
  public readonly tagId?: UniqueID;
  private readonly subscriptions: (() => void)[] = [];

  private readonly coreCredentialsCache: URLMap<Lazy<DhcType.LoginCredentials>>;
  private readonly outputChannel: vscode.OutputChannel;
  private readonly toaster: IToastService;
  private readonly panelService: IPanelService;
  private readonly diagnosticsCollection: vscode.DiagnosticCollection;
  private cachedCreateClient: Promise<DhcType.CoreClient> | null = null;
  private cachedCreateSession: Promise<
    ConnectionAndSession<DhcType.IdeConnection, DhcType.IdeSession>
  > | null = null;
  private cachedInitApi: Promise<typeof DhcType> | null = null;

  private dh: typeof DhcType | null = null;
  private cn: DhcType.IdeConnection | null = null;
  private client: DhcType.CoreClient | null = null;
  private session: DhcType.IdeSession | null = null;

  get isInitialized(): boolean {
    return this.cachedInitApi != null;
  }

  get isConnected(): boolean {
    return this.dh != null && this.cn != null && this.session != null;
  }

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

  private getToastErrorMessage(
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

  async getPsk(): Promise<string | null> {
    const credentials = await this.coreCredentialsCache.get(this.serverUrl)?.();

    if (credentials?.type !== AUTH_HANDLER_TYPE_PSK) {
      return null;
    }

    return credentials.token ?? null;
  }

  async initApi(): Promise<typeof DhcType> {
    return initDhcApi(
      this.serverUrl,
      getTempDir({ subDirectory: urlToDirectoryName(this.serverUrl) })
    );
  }

  async initDh(): Promise<boolean> {
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

          const panelVariablesToUpdate = changes.updated.filter(
            (variable): variable is VariableDefintion =>
              this.panelService.hasPanel(
                this.serverUrl,
                variable.id as VariableID
              )
          );

          vscode.commands.executeCommand(
            REFRESH_VARIABLE_PANELS_CMD,
            this.serverUrl,
            panelVariablesToUpdate
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
      logger.error(err);
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

  async createClient(dh: typeof DhcType): Promise<DhcType.CoreClient> {
    try {
      return new dh.CoreClient(this.serverUrl.toString());
    } catch (err) {
      logger.error(err);
      throw err;
    }
  }

  async createSession(
    dh: typeof DhcType,
    client: DhcType.CoreClient
  ): Promise<ConnectionAndSession<DhcType.IdeConnection, DhcType.IdeSession>> {
    if (!this.coreCredentialsCache.has(this.serverUrl)) {
      const authConfig = new Set(
        (await client.getAuthConfigValues()).map(([, value]) => value)
      );

      if (authConfig.has(AUTH_HANDLER_TYPE_ANONYMOUS)) {
        this.coreCredentialsCache.set(this.serverUrl, async () => ({
          type: dh.CoreClient.LOGIN_TYPE_ANONYMOUS,
        }));
      } else if (authConfig.has(AUTH_HANDLER_TYPE_PSK)) {
        this.coreCredentialsCache.set(this.serverUrl, async () => ({
          type: AUTH_HANDLER_TYPE_PSK,
          // TODO: Login flow UI should be a separate concern
          // deephaven/vscode-deephaven/issues/151
          token: await vscode.window.showInputBox({
            ignoreFocusOut: true,
            placeHolder: 'Pre-Shared Key',
            prompt: 'Enter your Deephaven pre-shared key',
            password: true,
          }),
        }));
      }
    }

    if (this.coreCredentialsCache.has(this.serverUrl)) {
      const credentials = await this.coreCredentialsCache.get(
        this.serverUrl
      )!();
      return initDhcSession(client, credentials);
    }

    throw new Error('No supported authentication methods found.');
  }

  async dispose(): Promise<void> {
    this.clearCaches();
    this._onDidDisconnect.dispose();
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

  async runEditorCode(
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
      const start = performance.now();
      result = await this.session.runCode(text);
      logger.debug('Command took', performance.now() - start, 'ms');
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
}

export default DhcService;
