import * as vscode from 'vscode';
import type {
  EnterpriseDhType as DheType,
  QueryInfo,
} from '@deephaven-enterprise/jsapi-types';
import type { CorePlusManager } from '@deephaven-enterprise/client-utils';
import { EnterpriseCorePlusManager } from '@deephaven-enterprise/jsapi-manager';
import { createJsApiFactories } from '@deephaven-enterprise/jsapi-nodejs';
import {
  type ConsoleType,
  type DheAuthenticatedClientWrapper,
  type DheServerFeatures,
  type IAsyncCacheService,
  type IConfigService,
  type IDheService,
  type IDheServiceFactory,
  type IInteractiveConsoleQueryFactory,
  type UniqueID,
  type WorkerConfig,
  type WorkerInfo,
  type WorkerURL,
} from '../types';
import {
  getSharedTransportFactory,
  getTempDir,
  Logger,
  uniqueId,
  URLMap,
  urlToDirectoryName,
} from '../util';
import {
  getWorkerInfoFromQueryInfo,
  createInteractiveConsoleQuery,
  createOwnedICQueryName,
  deleteQueries,
  getDheFeatures,
  getSerialFromTagId,
  getWorkerInfoFromQuerySerial,
  isAttachableWorker,
  listAttachableWorkers,
} from '../dh/dhe';
import {
  CLOSE_CREATE_QUERY_VIEW_CMD,
  CREATE_DHE_AUTHENTICATED_CLIENT_CMD,
  isTerminalQueryStatus,
  QueryCreationCancelledError,
  QueryStartupFailureError,
  UnsupportedFeatureQueryError,
} from '../common';
import { assertDefined, type QuerySerial } from '../shared';

const logger = new Logger('DheService');

/**
 * Service for managing DHE connections, sessions, workers, etc.
 */
export class DheService implements IDheService {
  /**
   * Creates a factory function that can be used to create DheService instances.
   * @param configService Configuration service.
   * @param dheClientCache DHE client cache.
   * @param dheJsApiCache DHE JS API cache.
   * @param interactiveConsoleQueryFactory Factory for creating interactive console
   * queries.
   * @returns A factory function that can be used to create DheService instances.
   */
  static factory = (
    configService: IConfigService,
    dheClientCache: URLMap<DheAuthenticatedClientWrapper>,
    dheJsApiCache: IAsyncCacheService<URL, DheType>,
    interactiveConsoleQueryFactory: IInteractiveConsoleQueryFactory
  ): IDheServiceFactory => {
    return {
      create: (serverUrl: URL): IDheService => {
        const serverConfig = configService
          .getEnterpriseServers()
          .find(server => server.url.href === serverUrl.href);

        return new DheService(
          serverConfig?.label ?? serverUrl.href,
          serverUrl,
          configService,
          dheClientCache,
          dheJsApiCache,
          interactiveConsoleQueryFactory
        );
      },
    };
  };

  /**
   * Private constructor since the static `factory` method is the intended
   * mechanism for instantiating.
   */
  private constructor(
    label: string,
    serverUrl: URL,
    configService: IConfigService,
    dheClientCache: URLMap<DheAuthenticatedClientWrapper>,
    dheJsApiCache: IAsyncCacheService<URL, DheType>,
    interactiveConsoleQueryFactory: IInteractiveConsoleQueryFactory
  ) {
    this.label = label;
    this.serverUrl = serverUrl;
    this._config = configService;
    this._dheClientCache = dheClientCache;
    this._dheJsApiCache = dheJsApiCache;
    this._dheServerFeaturesCache = new URLMap<DheServerFeatures>();
    this._ownedQuerySerialSet = new Set<QuerySerial>();
    this._interactiveConsoleQueryFactory = interactiveConsoleQueryFactory;
    this._workerInfoMap = new URLMap<WorkerInfo, WorkerURL>();

    this._dheClientCache.onDidChange(this._onDidDheClientCacheInvalidate);
  }

  private _clientPromise: Promise<DheAuthenticatedClientWrapper | null> | null =
    null;
  private _corePlusManagerPromise: Promise<CorePlusManager | null> | null =
    null;
  private _isConnected: boolean = false;
  private _operateAs: string | null = null;
  private _removeConfigListeners: (() => void) | null = null;

  private readonly _config: IConfigService;
  private readonly _dheClientCache: URLMap<DheAuthenticatedClientWrapper>;
  private readonly _dheJsApiCache: IAsyncCacheService<URL, DheType>;
  private readonly _dheServerFeaturesCache: URLMap<DheServerFeatures>;
  private readonly _pendingQueryTagIds = new Set<UniqueID>();
  private readonly _ownedQuerySerialSet: Set<QuerySerial>;
  private readonly _interactiveConsoleQueryFactory: IInteractiveConsoleQueryFactory;
  private readonly _workerInfoMap: URLMap<WorkerInfo, WorkerURL>;

  private readonly _onWorkerAttachable = new vscode.EventEmitter<QueryInfo>();
  readonly onWorkerAttachable = this._onWorkerAttachable.event;

  private readonly _onWorkerRemoved = new vscode.EventEmitter<QuerySerial>();
  readonly onWorkerRemoved = this._onWorkerRemoved.event;

  readonly label: string;
  readonly serverUrl: URL;

  /**
   * Whether the DHE client is connected.
   */
  get isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Initialize DHE client and login.
   * @param operateAsAnotherUser Whether to operate as another user.
   * @returns DHE client or null if initialization failed.
   */
  private _initClient = async (
    operateAsAnotherUser: boolean
  ): Promise<DheAuthenticatedClientWrapper | null> => {
    if (!this._dheClientCache.has(this.serverUrl)) {
      await vscode.commands.executeCommand(
        CREATE_DHE_AUTHENTICATED_CLIENT_CMD,
        this.serverUrl,
        operateAsAnotherUser
      );
    }

    const maybeClient = await this._dheClientCache.get(this.serverUrl);

    if (maybeClient != null) {
      const userInfo = await maybeClient.client.getUserInfo();

      this._operateAs = userInfo.operateAs;

      await this._subscribeToWorkerEvents(maybeClient);
    }

    if (!this._dheServerFeaturesCache.has(this.serverUrl)) {
      try {
        const features = await getDheFeatures(this.serverUrl);
        this._dheServerFeaturesCache.set(this.serverUrl, features);
      } catch (err) {
        if (err instanceof UnsupportedFeatureQueryError) {
          logger.debug(
            `DHE server ${err.serverUrl} does not support features query`
          );
        } else {
          logger.error('Failed to get DHE server features', err);
        }
      }
    }

    return maybeClient ?? null;
  };

  /**
   * Dispose queries for given query serials.
   * @param querySerials Query serials to dispose.
   */
  private _disposeQueries = async (
    querySerials: QuerySerial[]
  ): Promise<void> => {
    const dheClient = await this.getClient(false);

    if (dheClient != null) {
      await deleteQueries(dheClient.client, querySerials);
    }
  };

  private _onDidDheClientCacheInvalidate = (url: URL): void => {
    // Only reset when the client was actually removed from the cache (logout /
    // disconnect / failed login). The cache also fires `onDidChange` on `set`,
    // which happens during a successful login from inside `_initClient`;
    // resetting then would null out the `_clientPromise` still being awaited,
    // leaving a subsequent `getClient(false)` to short-circuit on `null`.
    if (
      url.toString() === this.serverUrl.toString() &&
      !this._dheClientCache.has(this.serverUrl)
    ) {
      // Reset the client promise so that the next call to `getClient` can
      // reinitialize it if necessary.
      this._clientPromise = null;

      // The CorePlusManager is bound to the specific (now stale) client
      // instance, so dispose + null it. The next `getCorePlusManager` call will
      // rebuild one from the fresh client.
      void this._disposeCorePlusManager();
    }
  };

  /**
   * Dispose the current CorePlusManager (if any) and reset the cached promise so
   * a subsequent `getCorePlusManager` rebuilds one from the current client.
   */
  private _disposeCorePlusManager = async (): Promise<void> => {
    const managerPromise = this._corePlusManagerPromise;
    this._corePlusManagerPromise = null;

    try {
      await managerPromise?.then(manager => manager?.dispose());
    } catch (err) {
      logger.error('Failed to dispose CorePlusManager', err);
    }
  };

  /**
   * Subscribe to DHE config added/updated/removed events. Emits
   * `onWorkerAttachable` when an IC worker becomes attachable, and
   * `onWorkerRemoved` when a tracked worker is removed or enters a terminal
   * state. Replaces any previous subscription.
   * @param dheClient DHE client to use.
   */
  private _subscribeToWorkerEvents = async (
    dheClient: DheAuthenticatedClientWrapper
  ): Promise<void> => {
    // Remove any previous listeners before re-registering.
    this._removeConfigListeners?.();

    const dhe = await this._dheJsApiCache.get(this.serverUrl);

    const onConfigAddedOrUpdated = ({
      detail: queryInfo,
    }: CustomEvent<QueryInfo>): void => {
      const status = queryInfo.designated?.status;

      if (isTerminalQueryStatus(status)) {
        // Terminal status on a tracked worker, fire _onWorkerRemoved
        if (this._isQueryTracked(queryInfo)) {
          logger.info('Worker entered terminal state:', queryInfo.serial);
          this._onWorkerRemoved.fire(queryInfo.serial as QuerySerial);
        }

        return;
      }

      if (
        !this._isQueryOwnedByExtension(queryInfo) &&
        isAttachableWorker(queryInfo, this._operateAs)
      ) {
        this._onWorkerAttachable.fire(queryInfo);
      }
    };

    const onConfigRemoved = ({
      detail: queryInfo,
    }: CustomEvent<QueryInfo>): void => {
      if (!this._isQueryTracked(queryInfo)) {
        return;
      }

      logger.info('Worker removed:', queryInfo.serial);
      this._onWorkerRemoved.fire(queryInfo.serial as QuerySerial);
    };

    const removeConfigListeners: (() => void)[] = [];
    this._removeConfigListeners = (): void => {
      for (const remove of removeConfigListeners) {
        remove();
      }
      removeConfigListeners.length = 0;
    };

    removeConfigListeners.push(
      dheClient.client.addEventListener(
        dhe.Client.EVENT_CONFIG_ADDED,
        onConfigAddedOrUpdated
      )
    );
    removeConfigListeners.push(
      dheClient.client.addEventListener(
        dhe.Client.EVENT_CONFIG_UPDATED,
        onConfigAddedOrUpdated
      )
    );
    removeConfigListeners.push(
      dheClient.client.addEventListener(
        dhe.Client.EVENT_CONFIG_REMOVED,
        onConfigRemoved
      )
    );
  };

  /**
   * Get the config for creating new workers.
   * @returns Worker config or undefined if not found.
   */
  getWorkerConfig = (): WorkerConfig | undefined => {
    return this._config
      .getEnterpriseServers()
      .find(server => server.url.toString() === this.serverUrl.toString())
      ?.experimentalWorkerConfig;
  };

  /**
   * Get worker info for given worker URL.
   * @param workerUrl Worker URL to get info for.
   * @returns Worker info or undefined if not found.
   */
  getWorkerInfo = (workerUrl: WorkerURL): WorkerInfo | undefined => {
    return this._workerInfoMap.get(workerUrl);
  };

  /**
   * Get DHE client.
   * @param initializeIfNull Whether to initialize client if it's not already initialized.
   * @param operateAsAnotherUser Whether to operate as another user.
   * @returns DHE client or null if not initialized.
   */
  async getClient(
    initializeIfNull: false
  ): Promise<DheAuthenticatedClientWrapper | null>;
  async getClient(
    initializeIfNull: true,
    operateAsAnotherUser: boolean
  ): Promise<DheAuthenticatedClientWrapper | null>;
  async getClient(
    initializeIfNull: boolean,
    operateAsAnotherUser = false
  ): Promise<DheAuthenticatedClientWrapper | null> {
    if (this._clientPromise == null) {
      if (!initializeIfNull) {
        return null;
      }

      this._clientPromise = this._initClient(operateAsAnotherUser);
    }

    const dheClient = await this._clientPromise;
    this._isConnected = Boolean(dheClient);

    if (dheClient == null) {
      this._clientPromise = null;
    }

    return dheClient;
  }

  /**
   * Lazily create the `EnterpriseCorePlusManager` for this DHE server, built
   * from the client this service already authenticates, so there is no second
   * login. Returns null when no client is available. The manager is cached on
   * the instance and disposed with the service / on client-cache invalidation.
   * @returns The CorePlusManager or null if the client is not available.
   */
  getCorePlusManager = async (): Promise<CorePlusManager | null> => {
    this._corePlusManagerPromise ??= this._initCorePlusManager();

    // Held in a local so the clear below can identity-check the promise we
    // actually awaited, rather than clobbering one a concurrent call installed.
    const managerPromise = this._corePlusManagerPromise;

    try {
      const manager = await managerPromise;

      // A null manager means no client was available yet rather than a hard
      // failure, but either way nothing is worth caching — clear so a later
      // call can retry.
      if (manager == null) {
        this._clearCorePlusManagerPromise(managerPromise);
      }

      return manager;
    } catch (err) {
      this._clearCorePlusManagerPromise(managerPromise);
      throw err;
    }
  };

  /**
   * Clear the cached CorePlusManager promise, but only if it is still the one
   * the caller was awaiting — a concurrent `_disposeCorePlusManager` or a retry
   * may already have replaced it.
   * @param managerPromise The promise the caller awaited.
   */
  private _clearCorePlusManagerPromise = (
    managerPromise: Promise<CorePlusManager | null>
  ): void => {
    if (this._corePlusManagerPromise === managerPromise) {
      this._corePlusManagerPromise = null;
    }
  };

  /**
   * Build the `EnterpriseCorePlusManager` from the already-authenticated DHE
   * client. Replicates the upstream `initCorePlusManager` assembly minus the
   * login, so the manager reuses the extension's existing session, jsapi storage
   * dir, and transport factory.
   * @returns The CorePlusManager or null if the client is not available.
   */
  private _initCorePlusManager = async (): Promise<CorePlusManager | null> => {
    const dheClient = await this.getClient(false);
    if (dheClient == null) {
      return null;
    }

    const dhe = await this._dheJsApiCache.get(this.serverUrl);
    const { workerKinds } = await dheClient.client.getServerConfigValues();

    // Only the `loadCorePlusApi` (worker api loader) and `createCoreClient`
    // (construct-only, un-logged-in) hooks are needed — the manager owns worker
    // login via an auth token off the DHE client.
    const { loadCorePlusApi, createCoreClient } = createJsApiFactories({
      storageDir: getTempDir({
        subDirectory: urlToDirectoryName(this.serverUrl),
      }),
      transportFactory: getSharedTransportFactory(),
    });

    return new EnterpriseCorePlusManager(
      dhe,
      dheClient.client,
      workerKinds,
      loadCorePlusApi,
      createCoreClient
    );
  };

  private _isQueryOwnedByExtension = (
    querySerialOrInfo: QuerySerial | QueryInfo
  ): boolean => {
    const { name, serial } =
      typeof querySerialOrInfo === 'object'
        ? querySerialOrInfo
        : { serial: querySerialOrInfo };

    if (name != null) {
      for (const tagId of this._pendingQueryTagIds) {
        // Workers created by the extension can have `_vN` version suffixes
        // added by the iframe create flow check names by prefix.
        const icQueryNamePrefix = createOwnedICQueryName(tagId);

        if (name.startsWith(icQueryNamePrefix)) {
          return true;
        }
      }
    }

    return this._ownedQuerySerialSet.has(serial as QuerySerial);
  };

  private _isQueryTracked = ({ serial }: QueryInfo): boolean => {
    return [...this._workerInfoMap.values()].some(w => w.serial === serial);
  };

  /**
   * Create an InteractiveConsole query and get worker info from it.
   * @param tagId Unique tag id to include in the worker info.
   * @param consoleType Console type to create.
   * @returns Worker info.
   */
  createWorker = async (
    tagId: UniqueID,
    consoleType?: ConsoleType
  ): Promise<WorkerInfo> => {
    const dheClient = await this.getClient(true, false);
    if (dheClient == null) {
      const msg =
        'Failed to create worker because DHE client failed to initialize.';
      logger.error(msg);
      throw new Error(msg);
    }

    const dhe = await this._dheJsApiCache.get(this.serverUrl);

    const isUISupported =
      this._dheServerFeaturesCache.get(this.serverUrl)?.features
        .createQueryIframe ?? false;

    let startupFailureStatus: string | null = null;

    const queryName = createOwnedICQueryName(tagId);

    // Suppress auto-attach for this worker while it is being created. The
    // config event that flips it to `Running` would otherwise race the create
    // path and auto-attach it (see the `_isQueryOwned` guard in
    // `_subscribeToWorkerEvents`).
    //
    // The `finally` below clears this guard *before* `_querySerialSet.add`
    // engages the serial-based one. The handoff is only safe because nothing
    // awaits in between, so no config event can be delivered in that window —
    // do not introduce an `await` between the `finally` and the `add`.
    this._pendingQueryTagIds.add(tagId);

    const removeStartupFailureListener = dheClient.client.addEventListener(
      dhe.Client.EVENT_CONFIG_UPDATED,
      ({ detail: queryInfo }: CustomEvent<QueryInfo>) => {
        const status = queryInfo.designated?.status;
        if (
          isTerminalQueryStatus(status) &&
          queryInfo.name.startsWith(queryName)
        ) {
          logger.info(
            'Query entered terminal state during creation:',
            queryInfo.name,
            status
          );
          startupFailureStatus = status;
          vscode.commands.executeCommand(CLOSE_CREATE_QUERY_VIEW_CMD);
        }
      }
    );

    let querySerial: QuerySerial | null = null;

    try {
      querySerial = isUISupported
        ? await this._interactiveConsoleQueryFactory(
            this.serverUrl,
            tagId,
            consoleType
          )
        : await createInteractiveConsoleQuery(
            tagId,
            dheClient.client,
            this.getWorkerConfig(),
            consoleType
          );
    } catch (err) {
      if (err instanceof QueryCreationCancelledError) {
        const querySerial = await this.getQuerySerialFromTag(tagId);
        if (querySerial != null) {
          deleteQueries(dheClient.client, [querySerial]);
        }
        if (startupFailureStatus != null) {
          throw new QueryStartupFailureError(startupFailureStatus);
        }
      }

      throw err;
    } finally {
      removeStartupFailureListener();
      this._pendingQueryTagIds.delete(tagId);
    }

    if (querySerial == null) {
      throw new Error('Failed to create query.');
    }
    this._ownedQuerySerialSet.add(querySerial);

    const workerInfo = await getWorkerInfoFromQuerySerial(
      tagId,
      dhe,
      dheClient.client,
      querySerial
    );
    if (workerInfo == null) {
      throw new Error('Failed to create worker.');
    }

    this._workerInfoMap.set(workerInfo.workerUrl, workerInfo);

    return workerInfo;
  };

  /**
   * Register a pre-existing Running worker by building WorkerInfo from the
   * given QueryInfo. Does NOT add the serial to `_querySerialSet` — registered
   * workers are never owned and must never be deleted by the extension.
   * @param queryInfo The already-Running QueryInfo for the worker to register.
   * @returns WorkerInfo for the registered worker.
   */
  registerWorkerInfo = (queryInfo: QueryInfo): WorkerInfo => {
    const tagId = uniqueId();
    const workerInfo = getWorkerInfoFromQueryInfo(tagId, queryInfo);
    if (workerInfo == null) {
      throw new Error(
        `Cannot register worker for query info: ${queryInfo.serial}`
      );
    }

    this._workerInfoMap.set(workerInfo.workerUrl, workerInfo);

    return workerInfo;
  };

  /**
   * List all running InteractiveConsole workers owned by the current effective
   * user.
   * @param exclude Iterable of query serials to exclude from the results.
   * @returns A promise resolving to the filtered QueryInfo array.
   */
  listAttachableWorkers = async (
    exclude: Iterable<QuerySerial>
  ): Promise<QueryInfo[]> => {
    const dheClient = await this.getClient(false);
    if (dheClient == null) {
      return [];
    }
    return listAttachableWorkers(dheClient.client, exclude);
  };

  /**
   * Delete a worker. Only deletes the server-side PQ when the worker is owned
   * by this extension (serial is in `_querySerialSet`). Attached workers are
   * removed from `_workerInfoMap` but the PQ is left running.
   * @param workerUrl Worker URL to delete.
   */
  deleteWorker = async (workerUrl: WorkerURL): Promise<void> => {
    const workerInfo = this._workerInfoMap.get(workerUrl);
    if (workerInfo == null) {
      return;
    }

    this._workerInfoMap.delete(workerUrl);

    if (this._isQueryOwnedByExtension(workerInfo.serial)) {
      this._ownedQuerySerialSet.delete(workerInfo.serial);
      await this._disposeQueries([workerInfo.serial]);
    }
  };

  getQuerySerialFromTag = async (
    tagId: UniqueID
  ): Promise<QuerySerial | null> => {
    const dheClient = await this.getClient(false);
    assertDefined(dheClient, 'dheClient');

    return getSerialFromTagId(tagId, dheClient.client);
  };

  /**
   * Get DHE server features.
   * @returns DHE server features or undefined if not available.
   */
  getServerFeatures = (): DheServerFeatures | undefined => {
    return this._dheServerFeaturesCache.get(this.serverUrl);
  };

  dispose = async (): Promise<void> => {
    const querySerials = [...this._ownedQuerySerialSet];

    this._ownedQuerySerialSet.clear();
    this._removeConfigListeners?.();
    this._removeConfigListeners = null;
    this._onWorkerAttachable.dispose();
    this._onWorkerRemoved.dispose();

    await Promise.all([
      this._workerInfoMap.dispose(),
      this._disposeQueries(querySerials),
      this._disposeCorePlusManager(),
    ]);
  };
}
