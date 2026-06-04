import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import type { QueryInfo } from '@deephaven-enterprise/jsapi-types';
import {
  QueryCreationCancelledError,
  QueryStartupFailureError,
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
import type { QuerySerial } from '../shared';
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
    this._pendingConnectionMap = new URLMap<Promise<ConnectionState | null>>();
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

  private readonly _attachedWorkerSerials: Map<QuerySerial, WorkerURL> =
    new Map();
  private readonly _configService: IConfigService;
  private readonly _connectionMap: URLMap<ConnectionState>;
  private readonly _pendingConnectionMap: URLMap<
    Promise<ConnectionState | null>
  >;
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

  private _lastServerRunningStatus = new URLMap<boolean>();
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
      this._pendingConnectionMap.dispose(),
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

    // Filter our last status tracking to servers that are still configured.
    this._lastServerRunningStatus = new URLMap<boolean>(
      this.getServers()
        .filter(server => this._lastServerRunningStatus.has(server.url))
        .map(server => [
          server.url,
          this._lastServerRunningStatus.getOrThrow(server.url),
        ])
    );

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
      throw new Error(`Server with URL '${serverUrl}' not found.`);
    }

    // We only support 1 connection for DHC servers in the extension
    if (serverState.type === 'DHC' && serverState.connectionCount > 0) {
      logger.info('Already connected to server:', serverUrl.href);
      return this._connectionMap.getOrThrow(serverUrl);
    }

    if (this._pendingConnectionMap.has(serverUrl)) {
      logger.debug('Connection already in progress:', serverUrl.href);
      return this._pendingConnectionMap.getOrThrow(serverUrl);
    }

    const connectionPromise = this._doConnectToServer(
      serverState,
      workerConsoleType,
      operateAsAnotherUser
    );

    // We only support 1 connection for DHC servers in the extension, but the
    // count doesn't get updated until the connection is established, so we need
    // to mark pending connections to prevent multiple simultaneous connection
    // attempts to the same DHC server.
    if (serverState.type === 'DHC') {
      this._pendingConnectionMap.set(
        serverUrl,
        connectionPromise.then(result => {
          this._pendingConnectionMap.delete(serverUrl);
          return result;
        })
      );
    }

    return connectionPromise;
  };

  private _doConnectToServer = async (
    serverState: ServerState,
    workerConsoleType?: ConsoleType,
    operateAsAnotherUser: boolean = false
  ): Promise<ConnectionState | null> => {
    let serverUrl = serverState.url;

    logger.debug('Connecting to server:', serverUrl.href);

    let tagId: UniqueID | undefined;

    let placeholderUrl: URL | undefined;

    if (serverState.type === 'DHE') {
      const dheServerUrl = serverUrl;
      const isNewDheService = !this._dheServiceCache.has(dheServerUrl);
      const dheService = await this._dheServiceCache.get(dheServerUrl);

      // Get client. Client will be initialized if it doesn't exist (including
      // prompting user for login).
      if (!(await dheService.getClient(true, operateAsAnotherUser))) {
        return null;
      }

      // Mark the DHE server as connected now that we have a live client.
      // (connectionCount stays 0 until workers attach; isConnected reflects
      // the server-level connection, which is now established.)
      const currentServerState = this._serverMap.get(dheServerUrl);
      if (currentServerState != null && !currentServerState.isConnected) {
        this._serverMap.set(dheServerUrl, {
          ...currentServerState,
          isConnected: true,
        });
        this._onDidUpdate.fire();
      }

      // Wire the config-event subscription exactly once per DHE service
      // instance, BEFORE snapshotting, so any worker that appears or disappears
      // between the snapshot and now is not missed. `_connectWorker` reserves
      // each serial synchronously (before any `await`), so an event-driven
      // attach and the snapshot batch below can never double-connect the same
      // worker — whichever reaches `_connectWorker` first wins and the other is
      // a no-op.
      if (isNewDheService) {
        dheService.onDidWorkerAttachable(qi =>
          this._reconcileAttach(dheServerUrl, dheService, qi)
        );
        dheService.onDidWorkerRemoved(serial => this._reconcileDetach(serial));
      }

      // Snapshot currently-running attachable workers and compute the
      // not-yet-attached subset.
      const attachable = await dheService.listAttachableWorkers();
      const toAttach = attachable.filter(
        qi => !this._attachedWorkerSerials.has(qi.serial as QuerySerial)
      );

      if (toAttach.length > 0) {
        // Attach existing workers in batches to avoid server stampede.
        const BATCH_SIZE = 4;
        let firstConnection: ConnectionState | null = null;
        for (let i = 0; i < toAttach.length; i += BATCH_SIZE) {
          const batch = toAttach.slice(i, i + BATCH_SIZE);
          const connections = await Promise.all(
            batch.map(async qi => {
              const workerInfo = dheService.attachWorker(qi);
              return this._connectWorker(dheServerUrl, workerInfo);
            })
          );
          if (firstConnection == null) {
            firstConnection = connections.find(c => c != null) ?? null;
          }
        }
        if (toAttach.length > 1) {
          this._toaster.info(`Attached to ${toAttach.length} worker(s).`);
        }
        return firstConnection;
      }

      // Nothing left to attach — either no workers exist for this user, or all
      // of them already have live connections. Create a fresh one so clicking a
      // server always yields a usable session.
      const tagId = uniqueId();
      const placeholderUrl = this.addWorkerPlaceholderConnection(
        dheServerUrl,
        tagId
      );

      let workerInfo: WorkerInfo;
      try {
        workerInfo = await dheService.createWorker(tagId, workerConsoleType);

        // If the worker finished creating but there is no placeholder
        // connection, the user cancelled before it was ready.
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
          const msg =
            err instanceof QueryStartupFailureError
              ? err.message
              : 'Failed to create worker.';
          logger.error(err);
          this._outputChannel.appendLine(msg);
          this._toaster.error(msg);
        }

        this.removeWorkerPlaceholderConnection(placeholderUrl);
        return null;
      }

      this.removeWorkerPlaceholderConnection(placeholderUrl);
      return this._connectWorker(dheServerUrl, workerInfo);
    }

    // DHC path: single direct connection.
    const connection = this._dhcServiceFactory.create(serverUrl, undefined);

    // Initialize client + prompt for login if necessary
    const coreClient = await connection.getClient();

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
   * Create a Core+ JS API connection to an existing worker. Populates
   * `_workerURLToServerURLMap` for auth lookup and `_attachedWorkerSerials`
   * for idempotency/teardown. Used by both the create path and the attach path.
   * Does NOT touch placeholder connections — that is the create path's concern.
   * @param dheServerUrl The DHE server this worker belongs to.
   * @param workerInfo Worker info built from the query.
   * @returns The new connection state, or null on failure.
   */
  private _connectWorker = async (
    dheServerUrl: URL,
    workerInfo: WorkerInfo
  ): Promise<ConnectionState | null> => {
    const workerUrl = new URL(workerInfo.workerUrl);

    // Idempotency gate: reserve the serial synchronously, before any `await`,
    // so concurrent attach attempts for the same worker — e.g. the initial
    // enumeration racing a streaming config event, or two clicks on the same
    // server — cannot both connect and double-count. A later failure rolls the
    // reservation back so the worker can be retried.
    if (this._attachedWorkerSerials.has(workerInfo.serial)) {
      return this._connectionMap.get(workerUrl) ?? null;
    }
    this._attachedWorkerSerials.set(workerInfo.serial, workerInfo.workerUrl);

    // Map the worker URL to its DHE server so the auth flow can resolve creds.
    this._workerURLToServerURLMap.set(workerUrl, dheServerUrl);

    const connection = this._dhcServiceFactory.create(
      workerUrl,
      workerInfo.tagId
    );

    // Initialize client (drives getWorkerCredentials → createAuthToken).
    const coreClient = await connection.getClient();
    if (coreClient == null) {
      this._attachedWorkerSerials.delete(workerInfo.serial);
      return null;
    }

    this._connectionMap.set(workerUrl, connection);
    this._onDidUpdate.fire();

    if (!(await connection.initSession())) {
      this._attachedWorkerSerials.delete(workerInfo.serial);
      this._coreClientCache.delete(workerUrl);
      connection.dispose();
      this._connectionMap.delete(workerUrl);
      return null;
    }

    connection.onDidDisconnect(() => {
      logger.debug('onDidDisconnect fired for:', workerUrl.href);
      this.disconnectFromServer(workerUrl);
    });

    connection.onDidChangeRunningCodeStatus?.(() => {
      this._onDidUpdate.fire();
    });

    this.updateConnectionCount(dheServerUrl, 1);

    this._onDidConnect.fire(workerUrl);
    this._onDidUpdate.fire();

    return this._connectionMap.get(workerUrl) ?? null;
  };

  /**
   * Attach a single worker when a config event indicates it became attachable.
   * Idempotent: no-ops if the serial is already connected.
   */
  private _reconcileAttach = async (
    dheServerUrl: URL,
    dheService: IDheService,
    queryInfo: QueryInfo
  ): Promise<void> => {
    if (this._attachedWorkerSerials.has(queryInfo.serial as QuerySerial)) {
      return;
    }
    const workerInfo = dheService.attachWorker(queryInfo);
    await this._connectWorker(dheServerUrl, workerInfo);
  };

  /**
   * Detach a worker when a config event indicates it was removed or died.
   * No-ops if the serial is not tracked.
   */
  private _reconcileDetach = async (serial: QuerySerial): Promise<void> => {
    const workerUrl = this._attachedWorkerSerials.get(serial);
    if (workerUrl == null) {
      return;
    }
    await this.disconnectFromServer(workerUrl);
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

    // Clear the idempotency/teardown gate so a later reconnect can re-attach.
    const urlStr = serverOrWorkerUrl.toString();
    for (const [serial, url] of this._attachedWorkerSerials.entries()) {
      if (url.toString() === urlStr) {
        this._attachedWorkerSerials.delete(serial);
        break;
      }
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
   * Get the parent DHE server for a connection. Returns the DHE server state
   * when the connection is a DHE worker (its `serverUrl` is mapped to a DHE
   * server URL), or `undefined` for DHC connections, which have no parent
   * server node in the tree.
   * @param connection The connection to get the parent server for.
   * @returns The parent DHE server state, or `undefined`.
   */
  getServerForConnection = (
    connection: ConnectionState
  ): ServerState | undefined => {
    const dheServerUrl = this._workerURLToServerURLMap.get(
      connection.serverUrl
    );
    return dheServerUrl == null ? undefined : this.getServer(dheServerUrl);
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
   * Get the DHE service associated with the given worker URL.
   * There are a couple of scenarios where this might return null:
   * 1. The worker URL is for a DHC connection, which won't have a DHE service.
   * 2. The worker URL is for a DHE connection, but the DHE service hasn't been
   *    initialized yet (e.g., the worker is still being created).
   * We might eventually want to refactor this at some point to throw exceptions
   * and handle them explicitly upstream.
   * @param maybeWorkerUrl The worker URL to get the DHE service for.
   */
  getDheServiceForWorker = async (
    maybeWorkerUrl: URL
  ): Promise<IDheService | null> => {
    const dheServerUrl = this._workerURLToServerURLMap.get(maybeWorkerUrl);

    if (dheServerUrl == null) {
      return null;
    }

    // `dheServerUrl` could be for a placeholder, so check for DheService before
    // retrieving it from the cache below. This is important since the cache
    // will attempt to create a new DheService if it doesn't exist when calling
    // `this._dheServiceCache.get`.
    if (!this._dheServiceCache.has(dheServerUrl)) {
      return null;
    }

    return this._dheServiceCache.get(dheServerUrl);
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
    maybeWorkerUrl: URL
  ): Promise<WorkerInfo | undefined> => {
    const dheService = await this.getDheServiceForWorker(maybeWorkerUrl);

    if (dheService == null) {
      return;
    }

    // If we've gotten this far, maybeWorkerUrl is definitely a WorkerURL
    return dheService.getWorkerInfo(maybeWorkerUrl as WorkerURL);
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
        connectionState.serverUrl,
        languageId
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

    const promises = servers.map(async ({ type, url }) => {
      const isRunning = await (type === 'DHC'
        ? isDhcServerRunning(url, logger)
        : isDheServerRunning(url, logger));

      // In case configured servers have changed since the `getServers` call
      const server = this.getServer(url);
      if (server == null) {
        return;
      }

      // First time inspecting this server state or if running state has changed
      if (
        !this._lastServerRunningStatus.has(url) ||
        server.isRunning !== isRunning
      ) {
        logger.debug(`Server '${server.url}' isRunning:`, isRunning);
      }

      this._lastServerRunningStatus.set(url, isRunning);

      // Status hasn't changed, nothing to do
      if (server.isRunning === isRunning) {
        return;
      }

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
    });

    await Promise.all(promises);

    this._hasEverUpdatedStatus = true;
  };
}
