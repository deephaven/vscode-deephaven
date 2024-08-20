import * as vscode from 'vscode';
import {
  ConsoleType,
  SERVER_STATUS_CHECK_INTERVAL,
  type ServerState,
} from '../common';
import { isDhcServerRunning } from '../dh/dhc';
import { isDheServerRunning } from '../dh/dhe';
import type {
  IConfigService,
  IDhService,
  IDhServiceFactory,
  IServerManager,
} from './types';
import { getInitialServerStates } from '../util/serverUtils';
import { PollingService } from './PollingService';
import { Logger } from '../util';

const logger = new Logger('ServerManager');

export class ServerManager implements IServerManager {
  private _configService: IConfigService;
  private _poller: PollingService;
  private _serverMap: Map<vscode.Uri, ServerState>;
  private _connectionMap: Map<vscode.Uri, IDhService>;
  private _dhcServiceFactory: IDhServiceFactory;
  private _uriConnectionsMap: Map<vscode.Uri, IDhService>;

  private _onDidConnect = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidConnect = this._onDidConnect.event;

  private _onDidDisconnect = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidDisconnect = this._onDidDisconnect.event;

  private _onDidRegisterEditor = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidRegisterEditor = this._onDidRegisterEditor.event;

  private _onDidUpdate = new vscode.EventEmitter<void>();
  readonly onDidUpdate = this._onDidUpdate.event;

  constructor(
    configService: IConfigService,
    dhcServiceFactory: IDhServiceFactory
  ) {
    this._configService = configService;
    this._dhcServiceFactory = dhcServiceFactory;

    this._serverMap = new Map();
    this._connectionMap = new Map();
    this._uriConnectionsMap = new Map();
    this._poller = new PollingService();

    this.loadServerConfig();
  }

  loadServerConfig = (): void => {
    const initialDhcServerState = getInitialServerStates(
      'DHC',
      this._configService.getCoreServers()
    );

    const initialDheServerState = getInitialServerStates(
      'DHE',
      this._configService.getEnterpriseServers()
    );

    this._serverMap = new Map(
      [...initialDhcServerState, ...initialDheServerState].map(state => [
        state.url,
        state,
      ])
    );

    // If server config changes in a way that removes servers, disconnect any
    // active connections from them.
    for (const serverUrl of this._connectionMap.keys()) {
      if (!this._serverMap.has(serverUrl)) {
        this.disconnectFromServer(serverUrl);
      }
    }
  };

  connectToServer = async (serverUrl: vscode.Uri): Promise<void> => {
    if (this.hasConnection(serverUrl)) {
      logger.info('Already connected to server:', serverUrl);
      return;
    }

    const serverState = this._serverMap.get(serverUrl);

    // TODO: implement DHE
    if (serverState == null || serverState.type !== 'DHC') {
      return;
    }

    const connection = this._dhcServiceFactory.create(serverUrl);

    this._connectionMap.set(serverUrl, connection);
    this._onDidUpdate.fire();

    if (!(await connection.initDh())) {
      this._connectionMap.delete(serverUrl);
    }

    this._onDidConnect.fire(serverUrl);
    this._onDidUpdate.fire();
  };

  disconnectFromServer = async (serverUrl: vscode.Uri): Promise<void> => {
    const connection = this._connectionMap.get(serverUrl);

    if (connection == null) {
      return;
    }

    this._connectionMap.delete(serverUrl);

    // Remove any editor URIs associated with this connection
    this._uriConnectionsMap.forEach((dhService, uri) => {
      if (dhService === connection) {
        this._uriConnectionsMap.delete(uri);
      }
    });

    await connection.dispose();

    this._onDidDisconnect.fire(serverUrl);
    this._onDidUpdate.fire();
  };

  /**
   * Determine if the given server URL has any active connections.
   * @param serverUrl
   */
  hasConnection = (serverUrl: vscode.Uri): boolean => {
    return this._connectionMap.has(serverUrl);
  };

  /**
   * Determine if the given connection is assicated with any editor URIs.
   * @param connection
   */
  hasConnectionUris = (connection: IDhService): boolean => {
    for (const cn of this._uriConnectionsMap.values()) {
      if (cn === connection) {
        return true;
      }
    }

    return false;
  };

  getServers = (): ServerState[] => {
    // Start polling server status the first time servers are requested.
    // TBD: Is there a way to stop this when the servers list goes out of view?
    if (!this._poller.isRunning) {
      this._poller.start(this.updateStatus, SERVER_STATUS_CHECK_INTERVAL);
    }

    return [...this._serverMap.values()];
  };

  getConnections = (): IDhService[] => {
    return [...this._connectionMap.values()];
  };

  /**
   * Get all URIs associated with a connection.
   * @param connection
   */
  getConnectionUris = (connection: IDhService): vscode.Uri[] => {
    return [...this._uriConnectionsMap.entries()]
      .filter(([, cn]) => cn === connection)
      .map(([uri]) => uri);
  };

  /**
   * Get the connection associated with the URI of the given editor. If no
   * association exists, attempt to make one based on the first available connection
   * that supports the editor's console type. If no such connection exists, show
   * an error.
   * @param editor
   */
  getEditorConnection = async (
    editor: vscode.TextEditor
  ): Promise<IDhService | null> => {
    const uri = editor.document.uri;

    if (!this._uriConnectionsMap.has(uri)) {
      // Default to first connection supporting the console type
      const dhService = await this.getFirstConsoleTypeConnection(
        editor.document.languageId as ConsoleType
      );

      if (dhService != null) {
        await this.setEditorConnection(editor, dhService);
      }
    }

    return this._uriConnectionsMap.get(uri) ?? null;
  };

  getFirstConsoleTypeConnection = async (
    consoleType: ConsoleType
  ): Promise<IDhService | null> => {
    for (const dhService of this._connectionMap.values()) {
      const isConsoleTypeSupported =
        await dhService.supportsConsoleType(consoleType);

      if (isConsoleTypeSupported) {
        return dhService;
      }
    }

    return null;
  };

  /**
   * Get connection associated with the given URI.
   * @param uri
   */
  getUriConnection = (uri: vscode.Uri): IDhService | null => {
    return this._uriConnectionsMap.get(uri) ?? null;
  };

  setEditorConnection = async (
    editor: vscode.TextEditor,
    dhService: IDhService
  ): Promise<void> => {
    const uri = editor.document.uri;

    if (
      !(await dhService.supportsConsoleType(
        editor.document.languageId as ConsoleType
      ))
    ) {
      throw new Error(
        `Connection '${dhService.serverUrl}' does not support the console type of the editor.`
      );
    }

    this._uriConnectionsMap.delete(uri);

    this._uriConnectionsMap.set(uri, dhService);
    this._onDidUpdate.fire();
    this._onDidRegisterEditor.fire(uri);
  };

  updateStatus = async (): Promise<void> => {
    const promises = this.getServers().map(server =>
      (server.type === 'DHC'
        ? isDhcServerRunning(server.url)
        : isDheServerRunning(server.url)
      ).then(isRunning => {
        this._serverMap.set(server.url, { ...server, isRunning });
        if ((server.isRunning ?? false) !== isRunning) {
          // If server goes from running to stopped, get rid of any active
          // connections to it.
          if (!isRunning) {
            this.disconnectFromServer(server.url);
          }

          this._onDidUpdate.fire();
        }
      })
    );

    await Promise.all(promises);
  };

  async dispose(): Promise<void> {}
}
