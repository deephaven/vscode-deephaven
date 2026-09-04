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
  withResolvers,
  type PromiseWithResolvers,
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
    this._pendingConnectionMap = new URLMap<
      PromiseWithResolvers<ConnectionState | null>
    >();
    this._pendingServerConnections = new URLMap<PromiseWithResolvers<void>>();
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
    PromiseWithResolvers<ConnectionState | null>
  >;
  private readonly _pendingServerConnections: URLMap<
    PromiseWithResolvers<void>
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

  private _resolvePendingConnection = (
    serverUrl: URL,
    connectionState: ConnectionState | null
  ): void => {
    if (this._pendingConnectionMap.has(serverUrl)) {
      this._pendingConnectionMap.getOrThrow(serverUrl).resolve(connectionState);
      this._pendingConnectionMap.delete(serverUrl);
      this._onDidUpdate.fire();
    }
  };

  private _resolvePendingServerConnection = (serverUrl: URL): void => {
    if (this._pendingServerConnections.has(serverUrl)) {
      this._pendingServerConnections.getOrThrow(serverUrl).resolve();
      this._pendingServerConnections.delete(serverUrl);
      this._onDidUpdate.fire();
    }
  };

  isServerConnecting = (serverUrl: URL): boolean =>
    this._pendingServerConnections.has(serverUrl);

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

  /**
   * Connect to a server and attach to any Core / Core+ workers available for
   * the server. For DHE, if no workers are available and `createWorkerIfNone`
   * is `true`, creates one and attaches to it; if `false`, the server connects
   * (letting persistent queries populate) without provisioning a worker.
   * @param serverUrl The server to connect to.
   * @param workerConsoleType Console type to create a DHE worker with, if one
   * has to be created.
   * @param operateAsAnotherUser Whether to prompt for a DHE `operateAs` user.
   * @param createWorkerIfNone When no attachable DHE worker exists, whether to
   * auto-create one. Defaults to `true` (e.g. the run-code flow needs a live
   * console). The plain "connect to server" action passes `false`.
   * @returns The connection state of the attached worker, or `null` if the
   * connection or worker creation/attachment failed (or none was created).
   */
  connectToServer = async (
    serverUrl: URL,
    workerConsoleType?: ConsoleType,
    operateAsAnotherUser: boolean = false,
    createWorkerIfNone: boolean = true
  ): Promise<ConnectionState | null> => {
    const serverState = this._serverMap.get(serverUrl);

    if (serverState == null) {
      throw new Error(`Server with URL '${serverUrl}' not found.`);
    }

    // We only support 1 connection to a DHC server
    if (serverState.type === 'DHC' && serverState.connectionCount > 0) {
      logger.info('Already connected to server:', serverUrl.href);
      return this._connectionMap.getOrThrow(serverUrl);
    }

    if (this._pendingConnectionMap.has(serverUrl)) {
      logger.debug('Connection already in progress:', serverUrl.href);
      return this._pendingConnectionMap.getOrThrow(serverUrl).promise;
    }

    return this._doConnectToServer(
      serverState,
      workerConsoleType,
      operateAsAnotherUser,
      createWorkerIfNone
    );
  };

  private _doConnectToServer = async (
    serverState: ServerState,
    workerConsoleType: ConsoleType | undefined,
    operateAsAnotherUser: boolean,
    createWorkerIfNone: boolean
  ): Promise<ConnectionState | null> => {
    const serverUrl = serverState.url;

    logger.debug('Connecting to server:', serverUrl.href);

    // Mark server and worker connection as pending
    this._pendingServerConnections.set(serverUrl, withResolvers());
    this._pendingConnectionMap.set(serverUrl, withResolvers());
    this._onDidUpdate.fire();

    let firstConnection: ConnectionState | null = null;

    try {
      if (serverState.type === 'DHC') {
        firstConnection = await this._attachToWorker('Core', serverUrl, true);
      } else {
        const dheService = await this._connectToDheServer(
          serverUrl,
          operateAsAnotherUser
        );

        // The server-level connection is settled at this point; workers attach
        // after, and the server node should stop showing "connecting" now.
        this._resolvePendingServerConnection(serverUrl);

        if (dheService != null) {
          [firstConnection = null] = await this._createOrAttachToWorkers(
            dheService,
            workerConsoleType,
            createWorkerIfNone
          );
        }
      }
    } finally {
      // Both are no-ops when already resolved above; here they also cover the
      // paths that threw, which would otherwise leave the server node stuck
      // showing "connecting".
      this._resolvePendingServerConnection(serverUrl);
      this._resolvePendingConnection(serverUrl, firstConnection);
    }

    return firstConnection;
  };

  /**
   * Create a JS API connection to a worker, used by both the create and attach
   * paths. Populates `_workerURLToServerURLMap` for auth lookup and
   * `_attachedWorkerSerials` for idempotency / teardown. Placeholder connections
   * are the create path's concern and are not touched here.
   * @param label The connection label to show in the UI for this worker.
   * @param serverUrl The server this worker belongs to.
   * @param isOwned Whether this extension created the worker (and may delete it).
   * @param workerInfo Worker info built from the query. Omitted for DHC, where
   * the server URL is the connection URL.
   * @returns The new connection state, or null on failure.
   */
  private _attachToWorker = async (
    label: string,
    serverUrl: URL,
    isOwned: boolean,
    workerInfo?: WorkerInfo
  ): Promise<ConnectionState | null> => {
    const workerUrl = new URL(workerInfo?.workerUrl ?? serverUrl);

    if (workerInfo != null) {
      // Idempotency gate: reserve the serial synchronously, before any `await`,
      // so concurrent attach attempts for the same worker — e.g. the initial
      // enumeration racing a streaming config event, or two clicks on the same
      // server — cannot both connect and double-count. A later failure rolls the
      // reservation back so the worker can be retried.
      if (this._attachedWorkerSerials.has(workerInfo.serial)) {
        return this._connectionMap.get(workerUrl) ?? null;
      }
      this._attachedWorkerSerials.set(
        workerInfo.serial,
        workerUrl as WorkerURL
      );

      // Map the worker URL to its DHE server so the auth flow can resolve creds.
      this._workerURLToServerURLMap.set(workerUrl, serverUrl);
    }

    const connection = this._dhcServiceFactory.create(
      label,
      workerUrl,
      isOwned,
      workerInfo?.tagId
    );

    // Initialize client (includes auth flow).
    const coreClient = await connection.getClient();

    if (coreClient == null) {
      if (workerInfo != null) {
        this._attachedWorkerSerials.delete(workerInfo.serial);
      }

      return null;
    }

    this._connectionMap.set(workerUrl, connection);
    this._onDidUpdate.fire();

    if (!(await connection.initSession())) {
      if (workerInfo != null) {
        this._attachedWorkerSerials.delete(workerInfo.serial);
      }

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

    this.updateConnectionCount(serverUrl, 1);

    this._onDidConnect.fire(workerUrl);
    this._onDidUpdate.fire();

    return this._connectionMap.get(workerUrl) ?? null;
  };

  private _connectToDheServer = async (
    serverUrl: URL,
    operateAsAnotherUser: boolean
  ): Promise<IDheService | null> => {
    const isNewDheService = !this._dheServiceCache.has(serverUrl);
    const dheService = await this._dheServiceCache.get(serverUrl);

    // Get client. Client will be initialized if it doesn't exist (including
    // prompting user for login).
    if (!(await dheService.getClient(true, operateAsAnotherUser))) {
      return null;
    }

    // A live client means the server itself is connected, even though
    // `connectionCount` stays 0 until workers attach.
    const currentServerState = this._serverMap.get(serverUrl);
    if (currentServerState != null && !currentServerState.isConnected) {
      this._serverMap.set(serverUrl, {
        ...currentServerState,
        isConnected: true,
      });
      this._onDidUpdate.fire();
    }

    // Subscribe once per DHE service instance, and before the caller enumerates
    // attachable workers, so a worker appearing between the two is not missed.
    // `_attachToWorker` reserves each serial synchronously, so an event-driven
    // attach and the enumeration can never double-connect the same worker.
    if (isNewDheService) {
      dheService.onWorkerAttachable(queryInfo =>
        this._attachToAttachableWorker(serverUrl, dheService, queryInfo)
      );
      dheService.onWorkerRemoved(serial => this._detachWorker(serial));
    }

    return dheService;
  };

  /**
   * Attach to every worker on a DHE server the user can attach to. When there
   * are none and `createWorkerIfNone` is true, one is created instead;
   * otherwise the server stays connected with no worker, so persistent queries
   * can populate without provisioning one.
   * @param dheService The DHE service for the server.
   * @param workerConsoleType Console type to create a worker with, if one has
   * to be created.
   * @param createWorkerIfNone Whether to create a worker when none are
   * attachable.
   * @returns The connections that were established.
   */
  private _createOrAttachToWorkers = async (
    dheService: IDheService,
    workerConsoleType: ConsoleType | undefined,
    createWorkerIfNone: boolean
  ): Promise<ConnectionState[]> => {
    const attachableWorkers = await dheService.listAttachableWorkers(
      // exclude workers we are already attached to
      this._attachedWorkerSerials.keys()
    );

    // `isOwned` marks a worker this extension created, which it may also delete.
    const workerInfos: { isOwned: boolean; workerInfo: WorkerInfo }[] = [];

    if (attachableWorkers.length === 0) {
      if (!createWorkerIfNone) {
        return [];
      }

      const workerInfo = await this._createWorker(
        dheService,
        workerConsoleType
      );

      if (workerInfo == null) {
        return [];
      }

      workerInfos.push({ isOwned: true, workerInfo });
    } else {
      for (const queryInfo of attachableWorkers) {
        try {
          workerInfos.push({
            isOwned: false,
            workerInfo: dheService.registerWorkerInfo(queryInfo),
          });
        } catch (err) {
          logger.error(
            'Failed to register attachable worker; skipping:',
            queryInfo.serial,
            err
          );
        }
      }
    }

    const connections = (
      await Promise.all(
        workerInfos.map(({ isOwned, workerInfo }) =>
          this._attachToWorker(
            workerInfo.name,
            dheService.serverUrl,
            isOwned,
            workerInfo
          )
        )
      )
    ).filter(connection => connection != null);

    if (connections.length > 1) {
      this._toaster.info(`Attached to ${connections.length} workers.`);
    }

    return connections;
  };

  private _createWorker = async (
    dheService: IDheService,
    workerConsoleType?: ConsoleType
  ): Promise<WorkerInfo | null> => {
    const tagId = uniqueId();
    const placeholderUrl = this.addWorkerPlaceholderConnection(
      dheService.label,
      dheService.serverUrl,
      tagId
    );

    try {
      const workerInfo = await dheService.createWorker(
        tagId,
        workerConsoleType
      );

      // If the worker finished creating but there is no placeholder
      // connection, the user cancelled before it was ready.
      if (!this._connectionMap.has(placeholderUrl)) {
        dheService.deleteWorker(workerInfo.workerUrl);
        this._onDidUpdate.fire();
        return null;
      }

      this.removeWorkerPlaceholderConnection(placeholderUrl);
      return workerInfo;
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
  };

  /**
   * Explicitly create a new worker on a DHE server and attach to it. Unlike
   * `connectToServer` (which only auto-creates a worker when none are
   * attachable), this always creates a worker — it backs the "+" create-worker
   * action on DHE server nodes.
   * @param dheServerUrl The DHE server to create the worker on.
   * @param workerConsoleType Optional console type for the new worker.
   * @returns The new connection state, or `null` if client/worker
   * creation/attachment failed.
   */
  createWorker = async (
    dheServerUrl: URL,
    workerConsoleType?: ConsoleType
  ): Promise<ConnectionState | null> => {
    const dheService = await this._dheServiceCache.get(dheServerUrl);

    // Ensure a live client (the server is already connected when the "+" action
    // is visible, but guard anyway — this also covers a stale/expired client).
    if (!(await dheService.getClient(true, false))) {
      return null;
    }

    const workerInfo = await this._createWorker(dheService, workerConsoleType);
    if (workerInfo == null) {
      return null;
    }

    return this._attachToWorker(
      workerInfo.name,
      dheServerUrl,
      true,
      workerInfo
    );
  };

  /**
   * Attach a single worker when a config event indicates it became attachable.
   * Idempotent: no-ops if the serial is already connected.
   * @param dheServerUrl The DHE server the worker belongs to.
   * @param dheService The DHE service for that server.
   * @param queryInfo The query that became attachable.
   */
  private _attachToAttachableWorker = async (
    dheServerUrl: URL,
    dheService: IDheService,
    queryInfo: QueryInfo
  ): Promise<void> => {
    if (this._attachedWorkerSerials.has(queryInfo.serial as QuerySerial)) {
      return;
    }
    try {
      const workerInfo = dheService.registerWorkerInfo(queryInfo);
      await this._attachToWorker(
        workerInfo.name,
        dheServerUrl,
        false,
        workerInfo
      );
    } catch (err) {
      logger.error('Failed to attach worker:', queryInfo.serial, err);
    }
  };

  /**
   * Detach a worker when a config event indicates it was removed or died.
   * No-ops if the serial is not tracked.
   * @param serial The serial of the removed query.
   */
  private _detachWorker = async (serial: QuerySerial): Promise<void> => {
    const workerUrl = this._attachedWorkerSerials.get(serial);
    if (workerUrl == null) {
      return;
    }
    await this.disconnectFromServer(workerUrl);
  };

  /**
   * Register a sessionless connection for a persistent query's worker so the DH
   * embed panel (`OPEN_VARIABLE_PANELS_CMD`) can open its objects. It wires up
   * exactly the three lookups the panel path needs — `getConnection`,
   * `getWorkerInfo`, `getWorkerCredentials` — keyed by the worker URL, without
   * creating a console session. See {@link ConnectionState.isSessionless}.
   *
   * Not a worker connection: no `initSession`, no `connectionCount` increment,
   * and no `_attachedWorkerSerials` entry. Idempotent — re-registering the same
   * worker URL returns the existing worker info.
   *
   * Torn down when the DHE server disconnects: `disconnectFromDHEServer` walks
   * every worker URL mapped to the server, which includes these, and
   * `deleteWorker` leaves the PQ running because the serial was never marked
   * owned. There is no per-PQ teardown — one of these outlives collapsing its
   * tree node.
   * @param dheServerUrl The DHE server the PQ belongs to (for auth resolution).
   * @param queryInfo The running PQ whose worker to register.
   * @returns The registered `WorkerInfo`, or `null` if the DHE service/worker
   * info could not be resolved.
   */
  registerSessionlessConnection = async (
    dheServerUrl: URL,
    queryInfo: QueryInfo
  ): Promise<WorkerInfo | null> => {
    if (!this._dheServiceCache.has(dheServerUrl)) {
      return null;
    }

    const dheService = await this._dheServiceCache.get(dheServerUrl);

    let workerInfo: WorkerInfo;
    try {
      workerInfo = dheService.registerWorkerInfo(queryInfo);
    } catch (err) {
      logger.error(
        'Failed to register sessionless worker info:',
        queryInfo.serial,
        err
      );
      return null;
    }

    const workerUrl = new URL(workerInfo.workerUrl);

    // Map the worker URL to its DHE server so the panel auth flow
    // (`getWorkerCredentials` / `getWorkerInfo`) can resolve creds + info.
    this._workerURLToServerURLMap.set(workerUrl, dheServerUrl);

    // Register a lightweight non-console ConnectionState so
    // `PanelController._onRefreshPanelsContent`'s `getConnection` assertion is
    // satisfied. This is NOT a `DhcService` (so no PSK path, no session) and is
    // never counted as a worker connection.
    if (!this._connectionMap.has(workerUrl)) {
      this._connectionMap.set(workerUrl, {
        // Flagged so `getConnections` can exclude it: this is an auth/panel
        // shim, not a worker connection the user can select or run code on.
        isSessionless: true,
        label: workerInfo.name,
        isConnected: true,
        isRunningCode: false,
        serverUrl: workerUrl,
      });
      this._onDidUpdate.fire();
    }

    return workerInfo;
  };

  /**
   * Add a placeholder connection to represent a pending DHE Core+ woker creation.
   * @param label The connection label to show in the UI for this pending worker.
   * @param serverUrl The DHE server URL the pending worker is associated with.
   * @param tagId The tag ID of the worker.
   * @returns The placeholder URL.
   */
  addWorkerPlaceholderConnection = (
    label: string,
    serverUrl: URL,
    tagId: UniqueID
  ): URL => {
    // simple way to keep placeholder urls unique by just adding a tagId as the pathname
    const placeholderUrl = new URL(serverUrl);
    placeholderUrl.pathname = tagId;

    this._workerURLToServerURLMap.set(placeholderUrl, serverUrl);

    this._connectionMap.set(placeholderUrl, {
      label,
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
   * Get all worker connections. Optionally filter connections by server or
   * worker URL. Sessionless connections are always excluded — panel-auth shims
   * with no console session must not show up in the Interactive Consoles tree,
   * the connection picker, or any "run code here" target list. Use
   * `getConnection` to look one up directly by worker URL.
   * @param serverOrWorkerUrl The server or worker URL to filter connections by.
   * @returns An array of all worker connections.
   */
  getConnections = (serverOrWorkerUrl?: URL): ConnectionState[] => {
    const isWorkerConnection = (connection: ConnectionState): boolean =>
      connection.isSessionless !== true;

    if (serverOrWorkerUrl == null) {
      return [...this._connectionMap.values()].filter(isWorkerConnection);
    }

    if (this._connectionMap.has(serverOrWorkerUrl)) {
      const connection = this._connectionMap.getOrThrow(serverOrWorkerUrl);
      return isWorkerConnection(connection) ? [connection] : [];
    }

    const server = this.getServer(serverOrWorkerUrl);
    if (server == null) {
      return [];
    }

    if (server.type === 'DHC') {
      const connection = this._connectionMap.get(serverOrWorkerUrl);
      return connection == null || !isWorkerConnection(connection)
        ? []
        : [connection];
    }

    // For DHE, return all connections associated with the server URL
    return [...this._connectionMap.values()].filter(connection => {
      if (!isWorkerConnection(connection)) {
        return false;
      }
      const dheServerUrl =
        this._workerURLToServerURLMap.get(connection.serverUrl) ??
        connection.serverUrl;
      return dheServerUrl.toString() === serverOrWorkerUrl.toString();
    });
  };

  /**
   * Get the parent server for a connection. For a DHE worker, resolves the DHE
   * server via the worker→server map; for a DHC connection, the connection's
   * `serverUrl` is itself the server URL. Returns `undefined` only when no
   * matching server is registered.
   * @param connection The connection to get the parent server for.
   * @returns The parent server state, or `undefined`.
   */
  getServerForConnection = (
    connection: ConnectionState
  ): ServerState | undefined => {
    const serverUrl =
      this._workerURLToServerURLMap.get(connection.serverUrl) ??
      connection.serverUrl;
    return this.getServer(serverUrl);
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
