import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import type { EnterpriseDhType as DheType } from '@deephaven-enterprise/jsapi-types';
import {
  AUTH_HANDLER_TYPE_PSK,
  isDhcServerRunning,
  isDheServerRunning,
} from '@deephaven/require-jsapi';
import { UnsupportedConsoleTypeError } from '../common';
import type {
  ConsoleType,
  ICacheService,
  IConfigService,
  IDhServiceFactory,
  IServerManager,
  ConnectionState,
  ServerState,
} from '../types';
import {
  getInitialServerStates,
  isDisposable,
  isInstanceOf,
  Logger,
} from '../util';
import { URLMap } from './URLMap';
import { URIMap } from './URIMap';
import DhService from './DhService';

const logger = new Logger('ServerManager');

export class ServerManager implements IServerManager {
  constructor(
    configService: IConfigService,
    credentialsCache: URLMap<DhcType.LoginCredentials>,
    dhcServiceFactory: IDhServiceFactory,
    dheJsApiCache: ICacheService<URL, DheType>
  ) {
    this._configService = configService;
    this._credentialsCache = credentialsCache;
    this._dhcServiceFactory = dhcServiceFactory;
    this._dheJsApiCache = dheJsApiCache;
    this._serverMap = new URLMap<ServerState>();
    this._connectionMap = new URLMap<ConnectionState>();
    this._uriConnectionsMap = new URIMap<ConnectionState>();

    this.canStartServer = false;

    void this.loadServerConfig();
  }

  private readonly _configService: IConfigService;
  private readonly _connectionMap: URLMap<ConnectionState>;
  private readonly _credentialsCache: URLMap<DhcType.LoginCredentials>;
  private readonly _dhcServiceFactory: IDhServiceFactory;
  private readonly _dheJsApiCache: ICacheService<URL, DheType>;
  private readonly _uriConnectionsMap: URIMap<ConnectionState>;
  private _serverMap: URLMap<ServerState>;

  private readonly _onDidConnect = new vscode.EventEmitter<URL>();
  readonly onDidConnect = this._onDidConnect.event;

  private readonly _onDidDisconnect = new vscode.EventEmitter<URL>();
  readonly onDidDisconnect = this._onDidDisconnect.event;

  private readonly _onDidLoadConfig = new vscode.EventEmitter<void>();
  readonly onDidLoadConfig = this._onDidLoadConfig.event;

  private readonly _onDidServerStatusChange =
    new vscode.EventEmitter<ServerState>();
  readonly onDidServerStatusChange = this._onDidServerStatusChange.event;

  private readonly _onDidRegisterEditor = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidRegisterEditor = this._onDidRegisterEditor.event;

  private readonly _onDidUpdate = new vscode.EventEmitter<void>();
  readonly onDidUpdate = this._onDidUpdate.event;

  private _hasEverUpdatedStatus = false;

  canStartServer: boolean;

  loadServerConfig = async (): Promise<void> => {
    // We want to keep any existing managed servers that aren't overridden by
    // the latest config so we don't lose the PSKs that were generated when
    // the servers were created.
    const managedServersStates = this._serverMap
      .values()
      .filter(v => v.isManaged);

    const configuredDhcServerState = getInitialServerStates(
      'DHC',
      this._configService.getCoreServers()
    );

    const configuredDheServerState = getInitialServerStates(
      'DHE',
      this._configService.getEnterpriseServers()
    );

    this._serverMap = new URLMap(
      [
        // Managed (pip) servers are first so that they can be overridden by the
        // configured servers if necessary
        ...managedServersStates,
        ...configuredDhcServerState,
        ...configuredDheServerState,
      ].map(state => [state.url, state])
    );

    // If server config changes in a way that removes servers, disconnect any
    // active connections from them.
    for (const serverUrl of this._connectionMap.keys()) {
      if (!this._serverMap.has(serverUrl)) {
        this.disconnectFromServer(serverUrl);
      }
    }

    await this.updateStatus();

    this._onDidLoadConfig.fire();
  };

  connectToServer = async (serverUrl: URL): Promise<ConnectionState | null> => {
    if (this.hasConnection(serverUrl)) {
      logger.info('Already connected to server:', serverUrl);
      return null;
    }

    const serverState = this._serverMap.get(serverUrl);

    if (serverState == null) {
      return null;
    }

    if (serverState.isManaged) {
      this._credentialsCache.set(serverUrl, {
        type: AUTH_HANDLER_TYPE_PSK,
        token: serverState.psk,
      });
    } else if (serverState.type === 'DHE') {
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
    this._uriConnectionsMap.forEach((connectionState, uri) => {
      if (connectionState === connection) {
        this._uriConnectionsMap.delete(uri);
      }
    });

    if (isDisposable(connection)) {
      await connection.dispose();
    }

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
  hasConnectionUris = (connection: ConnectionState): boolean => {
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

  /**
   * Get the server state for the given URL.
   * @param serverUrl The URL of the server to get.
   * @returns The server state, or `undefined` if no server with the given URL exists.
   */
  getServer = (serverUrl: URL): ServerState | undefined => {
    return this._serverMap.get(serverUrl);
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

  /**
   * Get the connection associated with the given server URL.
   * @param serverUrl The URL of the server to get the connection for.
   * @returns The connection, or `undefined` if no connection exists for the
   * given server URL.
   */
  getConnection = (serverUrl: URL): ConnectionState | undefined => {
    return this._connectionMap.get(serverUrl);
  };

  /**
   * Get all connections.
   * @returns An array of all connections.
   */
  getConnections = (): ConnectionState[] => {
    return [...this._connectionMap.values()];
  };

  /**
   * Get all URIs associated with a connection.
   * @param connection
   */
  getConnectionUris = (connection: ConnectionState): vscode.Uri[] => {
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
  ): Promise<ConnectionState | null> => {
    const uri = editor.document.uri;
    return this._uriConnectionsMap.get(uri) ?? null;
  };

  /**
   * Get connection associated with the given URI.
   * @param uri
   */
  getUriConnection = (uri: vscode.Uri): ConnectionState | null => {
    return this._uriConnectionsMap.get(uri) ?? null;
  };

  setEditorConnection = async (
    editor: vscode.TextEditor,
    connectionState: ConnectionState
  ): Promise<void> => {
    const uri = editor.document.uri;

    const isConsoleTypeSupported =
      isInstanceOf(connectionState, DhService) &&
      (await connectionState.supportsConsoleType(
        editor.document.languageId as ConsoleType
      ));

    if (!isConsoleTypeSupported) {
      throw new UnsupportedConsoleTypeError(
        `Connection '${connectionState.serverUrl}' does not support '${editor.document.languageId}'.`
      );
    }

    this._uriConnectionsMap.delete(uri);

    this._uriConnectionsMap.set(uri, connectionState);
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
        psk: randomUUID(),
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

      if ((server.isRunning ?? false) !== isRunning) {
        const newServerState = {
          ...server,
          isRunning,
        };

        this._serverMap.set(server.url, newServerState);

        // If server goes from running to stopped, get rid of any active
        // connections to it.
        if (!newServerState.isRunning) {
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
