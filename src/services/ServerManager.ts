import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import {
  QueryCreationCancelledError,
  UnsupportedConsoleTypeError,
} from '../common';
import type {
  ConsoleType,
  IConfigService,
  IDhcServiceFactory,
  IServerManager,
  ConnectionState,
  ServerState,
  WorkerInfo,
  IDheService,
  IAsyncCacheService,
  UniqueID,
  IToastService,
  CoreAuthenticatedClient,
  ISecretService,
  Psk,
  WorkerURL,
  DheAuthenticatedClientWrapper,
} from '../types';
import {
  getInitialServerStates,
  isDisposable,
  isInstanceOf,
  Logger,
  uniqueId,
  URIMap,
  URLMap,
} from '../util';
import { DhcService } from './DhcService';
import { getWorkerCredentials, isDheServerRunning } from '../dh/dhe';
import { isDhcServerRunning } from '../dh/dhc';

const logger = new Logger('ServerManager');

export class ServerManager implements IServerManager {
  constructor(
    configService: IConfigService,
    coreClientCache: URLMap<CoreAuthenticatedClient>,
    dhcServiceFactory: IDhcServiceFactory,
    dheClientCache: URLMap<DheAuthenticatedClientWrapper>,
    dheServiceCache: IAsyncCacheService<URL, IDheService>,
    outputChannel: vscode.OutputChannel,
    secretService: ISecretService,
    toaster: IToastService
  ) {
    this._configService = configService;
    this._connectionMap = new URLMap<ConnectionState>();
    this._coreClientCache = coreClientCache;
    this._dhcServiceFactory = dhcServiceFactory;
    this._dheClientCache = dheClientCache;
    this._dheServiceCache = dheServiceCache;
    this._outputChannel = outputChannel;
    this._secretService = secretService;
    this._serverMap = new URLMap<ServerState>();
    this._toaster = toaster;
    this._uriConnectionsMap = new URIMap<ConnectionState>();
    this._workerURLToServerURLMap = new URLMap<URL>();

    this.canStartServer = false;

    void this.loadServerConfig();
  }

  private readonly _configService: IConfigService;
  private readonly _connectionMap: URLMap<ConnectionState>;
  private readonly _coreClientCache: URLMap<CoreAuthenticatedClient>;
  private readonly _dhcServiceFactory: IDhcServiceFactory;
  private readonly _dheClientCache: URLMap<DheAuthenticatedClientWrapper>;
  private readonly _dheServiceCache: IAsyncCacheService<URL, IDheService>;
  private readonly _outputChannel: vscode.OutputChannel;
  private readonly _secretService: ISecretService;
  private readonly _toaster: IToastService;
  private readonly _uriConnectionsMap: URIMap<ConnectionState>;
  private readonly _workerURLToServerURLMap: URLMap<URL>;
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

  dispose = async (): Promise<void> => {
    this._onDidConnect.dispose();
    this._onDidDisconnect.dispose();
    this._onDidLoadConfig.dispose();
    this._onDidServerStatusChange.dispose();
    this._onDidRegisterEditor.dispose();
    this._onDidUpdate.dispose();

    await Promise.all([
      this._connectionMap.dispose(),
      this._serverMap.dispose(),
      this._uriConnectionsMap.dispose(),
      this._workerURLToServerURLMap.dispose(),
    ]);
  };

  loadServerConfig = async (): Promise<void> => {
    // We want to keep any existing managed servers that aren't overridden by
    // the latest config so we don't lose the PSKs that were generated when
    // the servers were created.
    const managedServersStates = [...this._serverMap.values()].filter(
      v => v.isManaged
    );

    const configuredDhcServerState = getInitialServerStates(
      'DHC',
      this._configService.getCoreServers()
    );

    const configuredDheServerState = getInitialServerStates(
      'DHE',
      this._configService.getEnterpriseServers()
    );

    const previousServerMap = this._serverMap;

    this._serverMap = new URLMap(
      [
        // Managed (pip) servers are first so that they can be overridden by the
        // configured servers if necessary
        ...managedServersStates,
        ...configuredDhcServerState,
        ...configuredDheServerState,
      ].map(state => [state.url, state])
    );

    // Preserve server states that are still configured
    for (const [url, newState] of this._serverMap.entries()) {
      const existingState = previousServerMap.get(url);
      if (existingState != null) {
        newState.isConnected = existingState.isConnected;
        newState.isRunning = existingState.isRunning;
        newState.connectionCount = existingState.connectionCount;
        
        if (newState.isManaged && existingState.isManaged) {
          newState.psk = existingState.psk;
        }
      }
    }

    // If server config changes in a way that removes servers, disconnect any
    // active connections from them.
    for (const connectionUrl of this._connectionMap.keys()) {
      // Use the parent DHE server URL for Core+ workers or placeholders, otherwise just use the connection URL (for direct connections)
      const serverUrl =
        this._workerURLToServerURLMap.get(connectionUrl) ?? connectionUrl;

      if (!this._serverMap.has(serverUrl)) {
        this.disconnectFromServer(connectionUrl);
      }
    }

    await this.updateStatus();

    this._onDidLoadConfig.fire();
  };

  connectToServer = async (
    serverUrl: URL,
    workerConsoleType?: ConsoleType,
    operateAsAnotherUser: boolean = false
  ): Promise<ConnectionState | null> => {
    const serverState = this._serverMap.get(serverUrl);

    if (serverState == null) {
      return null;
    }

    // DHE supports multiple connections, but DHC does not.
    if (
      !this._dheServiceCache.has(serverUrl) &&
      serverState.connectionCount > 0
    ) {
      logger.info('Already connected to server:', serverUrl);
      return null;
    }

    let tagId: UniqueID | undefined;

    let placeholderUrl: URL | undefined;

    if (serverState.type === 'DHE') {
      const dheService = await this._dheServiceCache.get(serverUrl);

      // Get client. Client will be initialized if it doesn't exist (including
      // prompting user for login).
      if (!(await dheService.getClient(true, operateAsAnotherUser))) {
        return null;
      }

      // The `serverUrl` in this block is for the DHE server but gets set to the
      // newly created worker url before leaving the block, so we need to update
      // the connection count while we still have the reference.
      this.updateConnectionCount(serverUrl, 1);
      tagId = uniqueId();

      // Put a placeholder connection in place until the worker is ready.
      placeholderUrl = this.addWorkerPlaceholderConnection(serverUrl, tagId);

      let workerInfo: WorkerInfo;
      try {
        workerInfo = await dheService.createWorker(tagId, workerConsoleType);

        // If the worker finished creating, but there is no placeholder connection,
        // this indicates that the user cancelled the creation before it was ready.
        // In this case, dispose of the worker.
        if (!this._connectionMap.has(placeholderUrl)) {
          dheService.deleteWorker(workerInfo.workerUrl);
          this._onDidUpdate.fire();
          return null;
        }
      } catch (err) {
        if (err instanceof QueryCreationCancelledError) {
          logger.info(err);
          const msg = 'Connection cancelled.';
          this._outputChannel.appendLine(msg);
          this._toaster.info(msg);
        } else {
          logger.error(err);
          const msg = 'Failed to create worker.';
          this._outputChannel.appendLine(msg);
          this._toaster.error(msg);
        }

        this.updateConnectionCount(serverUrl, -1);
        this._connectionMap.delete(placeholderUrl);
        return null;
      }

      // Map the worker URL to the server URL to make things easier to dispose
      // later.
      this._workerURLToServerURLMap.set(
        new URL(workerInfo.workerUrl),
        serverUrl
      );

      // Update the server URL to the worker url to be used below with core
      // connection creation.
      serverUrl = new URL(workerInfo.workerUrl);
    }

    const connection = this._dhcServiceFactory.create(serverUrl, tagId);

    // Initialize client + prompt for login if necessary
    const coreClient = await connection.getClient();

    // Cleanup placeholder connection if one exists
    if (placeholderUrl) {
      this.removeWorkerPlaceholderConnection(placeholderUrl);
    }

    if (coreClient == null) {
      return null;
    }

    this._connectionMap.set(serverUrl, connection);
    this._onDidUpdate.fire();

    if (!(await connection.initSession())) {
      this._coreClientCache.delete(serverUrl);

      connection.dispose();
      this._connectionMap.delete(serverUrl);
      return null;
    }

    connection.onDidDisconnect(() => {
      logger.debug('onDidDisconnect fired for:', serverUrl.href);
      this.disconnectFromServer(serverUrl);
    });

    connection.onDidChangeRunningCodeStatus?.(() => {
      this._onDidUpdate.fire();
    });

    this.updateConnectionCount(serverUrl, 1);

    this._onDidConnect.fire(serverUrl);
    this._onDidUpdate.fire();

    return this._connectionMap.get(serverUrl) ?? null;
  };

  /**
   * Add a placeholder connection to represent a pending DHE Core+ woker creation.
   * @param serverUrl The DHE server URL the pending worker is associated with.
   * @param tagId The tag ID of the worker.
   * @returns The placeholder URL.
   */
  addWorkerPlaceholderConnection = (serverUrl: URL, tagId: UniqueID): URL => {
    // simple way to keep placeholder urls unique by just adding a tagId as the pathname
    const placeholderUrl = new URL(serverUrl);
    placeholderUrl.pathname = tagId;

    this._workerURLToServerURLMap.set(placeholderUrl, serverUrl);

    this._connectionMap.set(placeholderUrl, {
      isConnected: false,
      isRunningCode: false,
      serverUrl: placeholderUrl,
      tagId,
    });

    this._onDidUpdate.fire();

    return placeholderUrl;
  };

  /**
   * Remove a worker placeholder connection.
   * @param placeholderUrl The placeholder URL to remove.
   */
  removeWorkerPlaceholderConnection = (placeholderUrl: URL): void => {
    this._workerURLToServerURLMap.delete(placeholderUrl);
    this._connectionMap.delete(placeholderUrl);
    this._onDidUpdate.fire();
  };

  disconnectEditor = (uri: vscode.Uri): void => {
    this._uriConnectionsMap.delete(uri);
    this._onDidUpdate.fire();
  };

  /**
   * Completely disconnect from a DHE server. This including all workers plus
   * the primary DHE client connection.
   * @param dheServerUrl The URL of the DHE server to disconnect from.
   * @returns Promise that resolves when all connections have been discarded.
   */
  disconnectFromDHEServer = async (dheServerUrl: URL): Promise<void> => {
    const workerUrls = [...this._workerURLToServerURLMap.entries()].filter(
      ([, url]) => url.toString() === dheServerUrl.toString()
    );

    for (const [workerUrl] of workerUrls) {
      await this.disconnectFromServer(workerUrl);
    }

    // Deleting the DHE client needs to happen after worker disposal since an
    // active client is needed to dispose workers.
    this._dheClientCache.get(dheServerUrl)?.client.disconnect();
    this._dheClientCache.delete(dheServerUrl);

    const serverState = this._serverMap.get(dheServerUrl);
    if (serverState == null) {
      return;
    }

    this._serverMap.set(dheServerUrl, {
      ...serverState,
      isConnected: false,
      connectionCount: 0,
    });

    this._onDidUpdate.fire();
  };

  disconnectFromServer = async (
    serverOrWorkerUrl: URL | WorkerURL
  ): Promise<void> => {
    const dheServerUrl = this._workerURLToServerURLMap.get(serverOrWorkerUrl);
    this._workerURLToServerURLMap.delete(serverOrWorkerUrl);

    this.updateConnectionCount(dheServerUrl ?? serverOrWorkerUrl, -1);

    // `dheServerUrl` can either be associated with a placeholder worker or a real
    // worker. Check if there is a corresponding DHE service in the cache, and if
    // so delete the associated worker. Otherwise, we are dealing with a placeholder,
    // and cleanup will happen once the worker is ready in `connectToServer`.
    if (dheServerUrl && this._dheServiceCache.has(dheServerUrl)) {
      const dheService = await this._dheServiceCache.get(dheServerUrl);
      await dheService.deleteWorker(serverOrWorkerUrl as WorkerURL);
    }

    const connection = this._connectionMap.get(serverOrWorkerUrl);
    if (connection == null) {
      return;
    }
    this._connectionMap.delete(serverOrWorkerUrl);

    // Remove any editor URIs associated with this connection
    this._uriConnectionsMap.forEach((connectionState, uri) => {
      if (connectionState === connection) {
        this._uriConnectionsMap.delete(uri);
      }
    });

    if (isDisposable(connection)) {
      try {
        await connection.dispose();
      } catch {
        // Ignore failed disposals
      }
    }

    this._coreClientCache.get(serverOrWorkerUrl)?.disconnect();
    this._coreClientCache.delete(serverOrWorkerUrl);

    this._onDidDisconnect.fire(serverOrWorkerUrl);
    this._onDidUpdate.fire();
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
   * @param matchPort If `true`, include the port when matching the server URL. Defaults to `true`.
   * @returns The server state, or `undefined` if no server with the given URL exists.
   */
  getServer = (
    serverUrl: URL,
    matchPort: boolean = true
  ): ServerState | undefined => {
    if (matchPort) {
      return this._serverMap.get(serverUrl);
    }

    for (const server of this._serverMap.values()) {
      if (server.url.hostname === serverUrl.hostname) {
        return server;
      }
    }
  };

  getServers = ({
    isRunning,
    hasConnections,
    type,
  }: {
    isRunning?: boolean;
    hasConnections?: boolean;
    type?: 'DHC' | 'DHE';
  } = {}): ServerState[] => {
    const servers = [...this._serverMap.values()];

    const match = (server: ServerState): boolean =>
      (isRunning == null || server.isRunning === isRunning) &&
      (hasConnections == null ||
        server.connectionCount > 0 === hasConnections) &&
      (type == null || server.type === type);

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
   * Get all connections. Optionally filter connections by server or worker URL.
   * @param serverOrWorkerUrl The server or worker URL to filter connections by.
   * @returns An array of all connections.
   */
  getConnections = (serverOrWorkerUrl?: URL): ConnectionState[] => {
    if (serverOrWorkerUrl == null) {
      return [...this._connectionMap.values()];
    }

    if (this._connectionMap.has(serverOrWorkerUrl)) {
      return [this._connectionMap.getOrThrow(serverOrWorkerUrl)];
    }

    const server = this.getServer(serverOrWorkerUrl);
    if (server == null) {
      return [];
    }

    if (server.type === 'DHC') {
      const connection = this._connectionMap.get(serverOrWorkerUrl);
      return connection == null ? [] : [connection];
    }

    // For DHE, return all connections associated with the server URL
    return [...this._connectionMap.values()].filter(connection => {
      const dheServerUrl =
        this._workerURLToServerURLMap.get(connection.serverUrl) ??
        connection.serverUrl;
      return dheServerUrl.toString() === serverOrWorkerUrl.toString();
    });
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
   * Get the connection associated with the given URI.
   * @param uri
   */
  getEditorConnection = async (
    uri: vscode.Uri
  ): Promise<ConnectionState | null> => {
    return this._uriConnectionsMap.get(uri) ?? null;
  };

  /**
   * Get connection associated with the given URI.
   * @param uri
   */
  getUriConnection = (uri: vscode.Uri): ConnectionState | null => {
    return this._uriConnectionsMap.get(uri) ?? null;
  };

  /**
   * Get worker credentials for the given worker URL.
   * @param serverOrWorkerUrl The worker URL to get credentials for.
   * @returns The worker credentials, or `null` if no credentials are available.
   */
  getWorkerCredentials = async (
    serverOrWorkerUrl: URL | WorkerURL
  ): Promise<DhcType.LoginCredentials | null> => {
    const dheServerUrl = this._workerURLToServerURLMap.get(serverOrWorkerUrl);

    if (dheServerUrl == null) {
      return null;
    }

    const dheClient = await this._dheClientCache.get(dheServerUrl);

    if (dheClient == null) {
      return null;
    }

    return getWorkerCredentials(dheClient.client);
  };

  /** Get worker info associated with the given server URL. */
  getWorkerInfo = async (
    workerUrl: WorkerURL
  ): Promise<WorkerInfo | undefined> => {
    const dheServerUrl = this._workerURLToServerURLMap.get(workerUrl);

    // `dheServerUrl` could be for a placeholder, so check for DheService before
    // retrieving it from the cache below. This is important since the cache
    // will attempt to create a new DheService if it doesn't exist when calling
    // `this._dheServiceCache.get`.
    if (dheServerUrl == null || !this._dheServiceCache.has(dheServerUrl)) {
      return;
    }

    const dheService = await this._dheServiceCache.get(dheServerUrl);

    return dheService.getWorkerInfo(workerUrl);
  };

  setEditorConnection = async (
    uri: vscode.Uri,
    languageId: string,
    connectionState: ConnectionState
  ): Promise<void> => {
    const isConsoleTypeSupported =
      languageId === 'markdown' ||
      (isInstanceOf(connectionState, DhcService) &&
        (await connectionState.supportsConsoleType(languageId as ConsoleType)));

    if (!isConsoleTypeSupported) {
      throw new UnsupportedConsoleTypeError(
        `Connection '${connectionState.serverUrl}' does not support '${languageId}'.`
      );
    }

    this._uriConnectionsMap.delete(uri);

    this._uriConnectionsMap.set(uri, connectionState);
    this._onDidUpdate.fire();
    this._onDidRegisterEditor.fire(uri);
  };

  /**
   * Update server states to reflect the given list of managed server URLs.
   * @param urls The list of URLs to update the server states with.
   * @param preferExistingPsk If `true`, use existing PSKs for managed servers
   * if available.
   */
  syncManagedServers = async (
    urls: URL[],
    preferExistingPsk = false
  ): Promise<void> => {
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

    // Add any new servers that aren't already in the serverMap
    for (const server of toAdd) {
      const existingPsk = preferExistingPsk
        ? await this._secretService.getPsk(server.url)
        : null;

      if (existingPsk != null) {
        logger.debug('Using existing psk for server:', server.url, existingPsk);
      }

      const serverState: ServerState = {
        ...server,
        isManaged: true,
        psk: existingPsk ?? (randomUUID() as Psk),
      };

      this._secretService.storePsk(serverState.url, serverState.psk);

      this._serverMap.set(server.url, serverState);
    }

    this._onDidUpdate.fire();
  };

  /**
   * Increment or decrement the connection count for the given server URL.
   * @param serverUrl
   * @param incrementOrDecrement
   * @returns The new connection count.
   */
  updateConnectionCount = (
    serverUrl: URL,
    incrementOrDecrement: 1 | -1
  ): number => {
    const serverState = this._serverMap.get(serverUrl);
    if (serverState == null) {
      return 0;
    }

    const connectionCount = Math.max(
      0,
      serverState.connectionCount + incrementOrDecrement
    );

    this._serverMap.set(serverUrl, {
      ...serverState,
      isConnected: connectionCount > 0 || this._dheServiceCache.has(serverUrl),
      connectionCount,
    });

    this._onDidUpdate.fire();

    return connectionCount;
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

      if (server.isRunning !== isRunning) {
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
}
