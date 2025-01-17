import * as vscode from 'vscode';
import { isAggregateError } from '@deephaven/jsapi-nodejs';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import {
  assertDefined,
  formatTimestamp,
  getCombinedSelectedLinesText,
  isNonEmptyArray,
  Logger,
  saveRequirementsTxt,
} from '../util';
import {
  getPythonDependencies,
  initDhcSession,
  type ConnectionAndSession,
} from '../dh/dhc';
import type {
  ConsoleType,
  CoreAuthenticatedClient,
  IDhcService,
  IDhcServiceFactory,
  IPanelService,
  ISecretService,
  IToastService,
  Psk,
  UniqueID,
  VariableChanges,
  VariableDefintion,
  VariableID,
} from '../types';
import type { URLMap } from './URLMap';
import {
  CREATE_CORE_AUTHENTICATED_CLIENT_CMD,
  OPEN_VARIABLE_PANELS_CMD,
  REFRESH_VARIABLE_PANELS_CMD,
  VARIABLE_UNICODE_ICONS,
} from '../common';
import { NoConsoleTypesError, parseServerError } from '../dh/errorUtils';
import { hasErrorCode } from '../util/typeUtils';

const logger = new Logger('DhcService');

export class DhcService implements IDhcService {
  /**
   * Creates a factory function that can be used to create DhcService instances.
   * @param coreClientCache Core client cache.
   * @param panelService Panel service.
   * @param diagnosticsCollection Diagnostics collection.
   * @param outputChannel Output channel.
   * @param secretService Secret service.
   * @param toaster Toast service for notifications.
   * @returns A factory function that can be used to create DhcService instances.
   */
  static factory = (
    coreClientCache: URLMap<CoreAuthenticatedClient>,
    panelService: IPanelService,
    diagnosticsCollection: vscode.DiagnosticCollection,
    outputChannel: vscode.OutputChannel,
    secretService: ISecretService,
    toaster: IToastService
  ): IDhcServiceFactory => {
    return {
      create: (serverUrl: URL, tagId?: UniqueID): IDhcService => {
        return new DhcService(
          serverUrl,
          coreClientCache,
          panelService,
          diagnosticsCollection,
          outputChannel,
          secretService,
          toaster,
          tagId
        );
      },
    };
  };

  /**
   * Private constructor since the static `factory` method is the intended
   * mechanism for instantiating.
   */
  private constructor(
    serverUrl: URL,
    coreClientCache: URLMap<CoreAuthenticatedClient>,
    panelService: IPanelService,
    diagnosticsCollection: vscode.DiagnosticCollection,
    outputChannel: vscode.OutputChannel,
    secretService: ISecretService,
    toaster: IToastService,
    tagId?: UniqueID
  ) {
    this.coreClientCache = coreClientCache;
    this.serverUrl = serverUrl;
    this.panelService = panelService;
    this.diagnosticsCollection = diagnosticsCollection;
    this.outputChannel = outputChannel;
    this.secretService = secretService;
    this.toaster = toaster;
    this.tagId = tagId;

    this.coreClientCache.onDidChange(this.onDidCoreClientCacheInvalidate);
  }

  private readonly _onDidDisconnect = new vscode.EventEmitter<URL>();
  readonly onDidDisconnect = this._onDidDisconnect.event;

  public readonly serverUrl: URL;
  public readonly tagId?: UniqueID;
  private readonly subscriptions: (() => void)[] = [];

  private readonly coreClientCache: URLMap<CoreAuthenticatedClient>;
  private readonly outputChannel: vscode.OutputChannel;
  private readonly secretService: ISecretService;
  private readonly toaster: IToastService;
  private readonly panelService: IPanelService;
  private readonly diagnosticsCollection: vscode.DiagnosticCollection;
  private clientPromise: Promise<CoreAuthenticatedClient | null> | null = null;
  private initSessionPromise: Promise<
    ConnectionAndSession<DhcType.IdeConnection, DhcType.IdeSession>
  > | null = null;

  private cn: DhcType.IdeConnection | null = null;
  private session: DhcType.IdeSession | null = null;

  get isInitialized(): boolean {
    return this.initSessionPromise != null;
  }

  get isConnected(): boolean {
    return this.cn != null && this.session != null;
  }

  private onDidCoreClientCacheInvalidate = (url: URL): void => {
    if (url.toString() === this.serverUrl.toString()) {
      // Reset the client promise so that the next call to `getClient` can
      // reinitialize it if necessary.
      this.clientPromise = null;
    }
  };

  private clearCaches(): void {
    this.clientPromise = null;
    this.initSessionPromise = null;

    if (this.cn != null) {
      this.cn.close();
      this._onDidDisconnect.fire(this.serverUrl);
    }
    this.cn = null;
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

  async getPsk(): Promise<Psk | undefined> {
    return this.secretService.getPsk(this.serverUrl);
  }

  async initSession(): Promise<boolean> {
    const client = await this.getClient();

    if (client == null) {
      const msg = 'Failed to create Deephaven client';
      logger.error(msg);
      this.outputChannel.appendLine(msg);
      this.toaster.error(msg);
      return false;
    }

    if (this.initSessionPromise == null) {
      this.outputChannel.appendLine('Creating session...');
      this.initSessionPromise = initDhcSession(client);

      try {
        const { cn, session } = await this.initSessionPromise;

        const fieldUpdateSubscription = cn.subscribeToFieldUpdates(changes => {
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

          if (isNonEmptyArray(panelVariablesToUpdate)) {
            logger.debug2(
              '[subscribeToFieldUpdates] Updating variables',
              panelVariablesToUpdate.map(v => v.title)
            );

            vscode.commands.executeCommand(
              REFRESH_VARIABLE_PANELS_CMD,
              this.serverUrl,
              panelVariablesToUpdate
            );
          } else {
            logger.debug2(
              '[subscribeToFieldUpdates] No existing panels to update:'
            );
          }
        });
        this.subscriptions.push(fieldUpdateSubscription);

        // TODO: Use constant 'disconnect' event name
        const disconnectSubscription = cn.addEventListener('disconnect', () => {
          this.clearCaches();
        });
        this.subscriptions.push(disconnectSubscription);

        const logMessageSubscription = session.onLogMessage(logItem => {
          // TODO: Should this pull log level from config somewhere?
          if (logItem.logLevel !== 'INFO') {
            const date = new Date(logItem.micros / 1000);
            const timestamp = formatTimestamp(date);

            this.outputChannel.append(
              `${timestamp} ${logItem.logLevel} ${logItem.message}`
            );
          }
        });
        this.subscriptions.push(logMessageSubscription);
      } catch (err) {}
    }

    try {
      const { cn, session } = await this.initSessionPromise;
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

  /**
   * Initialize client and login.
   * @returns Client or null if initialization failed.
   */
  private _initClient = async (): Promise<CoreAuthenticatedClient | null> => {
    if (!this.coreClientCache.has(this.serverUrl)) {
      await vscode.commands.executeCommand(
        CREATE_CORE_AUTHENTICATED_CLIENT_CMD,
        this.serverUrl
      );
    }

    const maybeClient = await this.coreClientCache.get(this.serverUrl);

    return maybeClient ?? null;
  };

  async getClient(): Promise<CoreAuthenticatedClient | null> {
    if (this.clientPromise == null) {
      this.clientPromise = this._initClient();
    }

    const client = await this.clientPromise;
    if (client == null) {
      this.clientPromise = null;
    }

    return client;
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

  /**
   * Generate a requirements.txt file based on the packages used in the current
   * session.
   */
  async generateRequirementsTxt(): Promise<void> {
    if (this.session == null) {
      await this.initSession();
    }

    assertDefined(this.session, 'session');

    const dependencies = await getPythonDependencies(this.session);

    await saveRequirementsTxt(dependencies);
  }

  async runEditorCode(
    editor: vscode.TextEditor,
    selectionOnly = false
  ): Promise<void> {
    // Clear previous diagnostics when cmd starts running
    this.diagnosticsCollection.set(editor.document.uri, []);

    if (this.session == null) {
      await this.initSession();
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

    if (isNonEmptyArray(showVariables)) {
      logger.debug(
        '[runEditorCode] Showing variables:',
        showVariables.map(v => v.title).join(', ')
      );

      vscode.commands.executeCommand(
        OPEN_VARIABLE_PANELS_CMD,
        this.serverUrl,
        showVariables
      );
    }
  }
}

export default DhcService;
