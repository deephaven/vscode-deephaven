import * as vscode from 'vscode';
import { UnsupportedConsoleTypeError } from '../common';
import { isDhcServerRunning } from '../dh/dhc';
import { isDheServerRunning } from '../dh/dhe';
import type {
  ConsoleType,
  IConfigService,
  IDhService,
  IDhServiceFactory,
  IServerManager,
  ServerState,
} from '../types';
import { getInitialServerStates, Logger } from '../util';
import { URLMap } from './URLMap';
import { URIMap } from './URIMap';

const logger = new Logger('ServerManager');

export class ServerManager implements IServerManager {
  constructor(
    configService: IConfigService,
    dhcServiceFactory: IDhServiceFactory
  ) {
    this._configService = configService;
    this._dhcServiceFactory = dhcServiceFactory;

    this._serverMap = new URLMap();
    this._connectionMap = new URLMap();
    this._uriConnectionsMap = new URIMap();

    this.canStartServer = false;

    this.loadServerConfig();

    this.loadServerConfig();
  }

  private readonly _configService: IConfigService;
  private readonly _connectionMap: URLMap<IDhService>;
  private readonly _dhcServiceFactory: IDhServiceFactory;
  private readonly _uriConnectionsMap: URIMap<IDhService>;
  private _serverMap: URLMap<ServerState>;

  private readonly _onDidConnect = new vscode.EventEmitter<URL>();
  readonly onDidConnect = this._onDidConnect.event;

  private readonly _onDidDisconnect = new vscode.EventEmitter<URL>();
  readonly onDidDisconnect = this._onDidDisconnect.event;

  private readonly _onDidServerStatusChange =
    new vscode.EventEmitter<ServerState>();
  readonly onDidServerStatusChange = this._onDidServerStatusChange.event;

  private readonly _onDidRegisterEditor = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidRegisterEditor = this._onDidRegisterEditor.event;

  private readonly _onDidUpdate = new vscode.EventEmitter<void>();
  readonly onDidUpdate = this._onDidUpdate.event;

  private _hasEverUpdatedStatus = false;

  canStartServer: boolean;

  loadServerConfig = (): void => {
    const initialDhcServerState = getInitialServerStates(
      'DHC',
      this._configService.getCoreServers()
    );

    const initialDheServerState = getInitialServerStates(
      'DHE',
      this._configService.getEnterpriseServers()
    );

    this._serverMap = new URLMap(
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

    this.updateStatus();
  };

  connectToServer = async (serverUrl: URL): Promise<IDhService | null> => {
    if (this.hasConnection(serverUrl)) {
      logger.info('Already connected to server:', serverUrl);
      return null;
    }

    const serverState = this._serverMap.get(serverUrl);

    // TODO: implement DHE #76
    if (serverState == null || serverState.type !== 'DHC') {
      return null;
    }

    const connection = this._dhcServiceFactory.create(serverUrl);

    this._connectionMap.set(serverUrl, connection);
    this._onDidUpdate.fire();

    if (!(await connection.initDh())) {
      this._connectionMap.delete(serverUrl);
    }

    this._onDidConnect.fire(serverUrl);
    this._onDidUpdate.fire();

    return this._connectionMap.get(serverUrl) ?? null;
  };

  disconnectEditor = (uri: vscode.Uri): void => {
    this._uriConnectionsMap.delete(uri);
    this._onDidUpdate.fire();
  };

  disconnectFromServer = async (serverUrl: URL): Promise<void> => {
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
  hasConnection = (serverUrl: URL): boolean => {
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

  /**
   * Check if `updateStatus` has ever been called.
   */
  hasEverUpdatedStatus = (): boolean => {
    return this._hasEverUpdatedStatus;
  };

  getServers = ({
    isRunning,
    hasConnections,
  }: {
    isRunning?: boolean;
    hasConnections?: boolean;
  } = {}): ServerState[] => {
    const servers = [...this._serverMap.values()];

    const match = (server: ServerState): boolean =>
      (isRunning == null || server.isRunning === isRunning) &&
      (hasConnections == null ||
        this.hasConnection(server.url) === hasConnections);

    return servers.filter(match);
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
   * Get the connection associated with the URI of the given editor.
   * @param editor
   */
  getEditorConnection = async (
    editor: vscode.TextEditor
  ): Promise<IDhService | null> => {
    const uri = editor.document.uri;
    return this._uriConnectionsMap.get(uri) ?? null;
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
      throw new UnsupportedConsoleTypeError(
        `Connection '${dhService.serverUrl}' does not support '${editor.document.languageId}'.`
      );
    }

    this._uriConnectionsMap.delete(uri);

    this._uriConnectionsMap.set(uri, dhService);
    this._onDidUpdate.fire();
    this._onDidRegisterEditor.fire(uri);
  };

  syncManagedServers = (urls: URL[]): void => {
    const urlStrSet = new Set(urls.map(String));

    // Remove any existing servers that aren't in the new list of urls.
    for (const server of this._serverMap.values()) {
      if (server.isManaged && !urlStrSet.has(server.url.toString())) {
        this.disconnectFromServer(server.url);
        this._serverMap.delete(server.url);
      }
    }

    const toAdd = getInitialServerStates(
      'DHC',
      urls.filter(url => !this._serverMap.has(url))
    );

    // Add any new servers that aren't already in the server
    for (const server of toAdd) {
      this._serverMap.set(server.url, {
        ...server,
        isManaged: true,
      });
    }

    this._onDidUpdate.fire();
  };

  /**
   * Update server statuses. Optionally filter servers to update by a list of urls.
   * @param filterBy Optional list of urls to filter servers by.
   */
  updateStatus = async (filterBy?: URL[]): Promise<void> => {
    logger.debug('Updating server statuses.');

    let servers = this.getServers();

    if (filterBy != null) {
      const filterSet = new Set(filterBy.map(String));
      servers = servers.filter(server => filterSet.has(server.url.toString()));
    }

    const promises = servers.map(async server => {
      const isRunning = await (server.type === 'DHC'
        ? isDhcServerRunning(server.url)
        : isDheServerRunning(server.url));

      const newServerState = {
        ...server,
        isRunning,
      };

      this._serverMap.set(server.url, newServerState);

      if ((server.isRunning ?? false) !== newServerState.isRunning) {
        // If server goes from running to stopped, get rid of any active
        // connections to it.
        if (!isRunning) {
          void this.disconnectFromServer(server.url);
        }

        this._onDidUpdate.fire();
        this._onDidServerStatusChange.fire(newServerState);
      }
    });

    await Promise.all(promises);

    this._hasEverUpdatedStatus = true;
  };

  async dispose(): Promise<void> {}
}
