import * as vscode from 'vscode';
import type {
  EnterpriseDhType as DheType,
  QueryInfo,
} from '@deephaven-enterprise/jsapi-types';
import {
  type ConsoleType,
  type DheAuthenticatedClientWrapper,
  type DheServerFeatures,
  type IAsyncCacheService,
  type IConfigService,
  type IDheService,
  type IDheServiceFactory,
  type IInteractiveConsoleQueryFactory,
  type IToastService,
  type UniqueID,
  type WorkerConfig,
  type WorkerInfo,
  type WorkerURL,
} from '../types';
import { Logger, uniqueId, URLMap } from '../util';
import {
  buildWorkerInfo,
  createInteractiveConsoleQuery,
  createQueryName,
  deleteQueries,
  getDheFeatures,
  getSerialFromTagId,
  getWorkerInfoFromQuery,
  isAttachableWorker,
  listAttachableWorkers as listAttachableWorkersHelper,
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
   * @param toaster Toast service for notifications.
   * @returns A factory function that can be used to create DheService instances.
   */
  static factory = (
    configService: IConfigService,
    dheClientCache: URLMap<DheAuthenticatedClientWrapper>,
    dheJsApiCache: IAsyncCacheService<URL, DheType>,
    interactiveConsoleQueryFactory: IInteractiveConsoleQueryFactory,
    toaster: IToastService
  ): IDheServiceFactory => {
    return {
      create: (serverUrl: URL): IDheService =>
        new DheService(
          serverUrl,
          configService,
          dheClientCache,
          dheJsApiCache,
          interactiveConsoleQueryFactory,
          toaster
        ),
    };
  };

  /**
   * Private constructor since the static `factory` method is the intended
   * mechanism for instantiating.
   */
  private constructor(
    serverUrl: URL,
    configService: IConfigService,
    dheClientCache: URLMap<DheAuthenticatedClientWrapper>,
    dheJsApiCache: IAsyncCacheService<URL, DheType>,
    interactiveConsoleQueryFactory: IInteractiveConsoleQueryFactory,
    toaster: IToastService
  ) {
    this.serverUrl = serverUrl;
    this._config = configService;
    this._dheClientCache = dheClientCache;
    this._dheJsApiCache = dheJsApiCache;
    this._dheServerFeaturesCache = new URLMap<DheServerFeatures>();
    this._querySerialSet = new Set<QuerySerial>();
    this._interactiveConsoleQueryFactory = interactiveConsoleQueryFactory;
    this._toaster = toaster;
    this._workerInfoMap = new URLMap<WorkerInfo, WorkerURL>();

    this._dheClientCache.onDidChange(this._onDidDheClientCacheInvalidate);
  }

  private _clientPromise: Promise<DheAuthenticatedClientWrapper | null> | null =
    null;
  private _isConnected: boolean = false;
  private _operateAs: string | null = null;
  private _removeConfigListeners: (() => void) | null = null;
  private readonly _creatingTagIds = new Set<UniqueID>();
  private readonly _config: IConfigService;
  private readonly _dheClientCache: URLMap<DheAuthenticatedClientWrapper>;
  private readonly _dheJsApiCache: IAsyncCacheService<URL, DheType>;
  private readonly _dheServerFeaturesCache: URLMap<DheServerFeatures>;
  private readonly _querySerialSet: Set<QuerySerial>;
  private readonly _interactiveConsoleQueryFactory: IInteractiveConsoleQueryFactory;
  private readonly _toaster: IToastService;
  private readonly _workerInfoMap: URLMap<WorkerInfo, WorkerURL>;

  private readonly _onDidWorkerAttachable =
    new vscode.EventEmitter<QueryInfo>();
  readonly onDidWorkerAttachable = this._onDidWorkerAttachable.event;

  private readonly _onDidWorkerRemoved = new vscode.EventEmitter<QuerySerial>();
  readonly onDidWorkerRemoved = this._onDidWorkerRemoved.event;

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
    // which happens during a successful login from inside `_initClient` itself.
    // Resetting on that `set` would null out the in-flight `_clientPromise` we
    // are currently awaiting, so a subsequent `getClient(false)` (e.g. from
    // `listAttachableWorkers`) would see `null` and short-circuit — silently
    // skipping the attach path. Guard on the client being absent so we only
    // reset for genuine invalidations.
    if (
      url.toString() === this.serverUrl.toString() &&
      !this._dheClientCache.has(this.serverUrl)
    ) {
      // Reset the client promise so that the next call to `getClient` can
      // reinitialize it if necessary.
      this._clientPromise = null;
    }
  };

  /**
   * Subscribe to DHE config added/updated/removed events. Emits
   * `onDidWorkerAttachable` when an IC worker becomes attachable, and
   * `onDidWorkerRemoved` when a tracked worker is removed or enters a terminal
   * state. Replaces any previous subscription.
   * @param dheClient DHE client to use.
   */
  private _subscribeToWorkerEvents = async (
    dheClient: DheAuthenticatedClientWrapper
  ): Promise<void> => {
    // Remove any previous listeners before re-registering.
    this._removeConfigListeners?.();

    const dhe = await this._dheJsApiCache.get(this.serverUrl);
    const operateAs = this._operateAs ?? '';

    const onConfigAddedOrUpdated = ({
      detail: queryInfo,
    }: CustomEvent<QueryInfo>): void => {
      const status = queryInfo.designated?.status;

      if (isTerminalQueryStatus(status)) {
        // Terminal status on a tracked worker → signal removal.
        const isTracked = [...this._workerInfoMap.values()].some(
          w => w.serial === queryInfo.serial
        );
        if (isTracked) {
          logger.info('Worker entered terminal state:', queryInfo.serial);
          this._onDidWorkerRemoved.fire(queryInfo.serial as QuerySerial);
        }
      } else if (
        isAttachableWorker(queryInfo, operateAs) &&
        !this._querySerialSet.has(queryInfo.serial as QuerySerial) &&
        !this._isCreatingQuery(queryInfo.name)
      ) {
        // Skip workers the extension is creating or already owns. The create
        // path connects those directly with the tagId it allocated for the
        // query name (`IC - VS Code - <tagId>`). Without this guard, the same
        // `EVENT_CONFIG_UPDATED` that flips a freshly-created worker to
        // `Running` would auto-attach it here, racing the create path: it would
        // double-connect with a *new* random tagId and let the now-functioning
        // detach/cleanup machinery tear down a worker mid-creation (surfacing as
        // a spurious startup failure). `_querySerialSet` covers the worker once
        // its serial is known; `_isCreatingQuery` covers the earlier window
        // (e.g. the iframe flow) where only the query name is known (Gotcha 4).
        this._onDidWorkerAttachable.fire(queryInfo);
      }
    };

    const onConfigRemoved = ({
      detail: queryInfo,
    }: CustomEvent<QueryInfo>): void => {
      const isTracked = [...this._workerInfoMap.values()].some(
        w => w.serial === queryInfo.serial
      );
      if (isTracked) {
        logger.info('Worker removed:', queryInfo.serial);
        this._onDidWorkerRemoved.fire(queryInfo.serial as QuerySerial);
      }
    };

    const removeAdded = dheClient.client.addEventListener(
      dhe.Client.EVENT_CONFIG_ADDED,
      onConfigAddedOrUpdated
    );
    const removeUpdated = dheClient.client.addEventListener(
      dhe.Client.EVENT_CONFIG_UPDATED,
      onConfigAddedOrUpdated
    );
    const removeRemoved = dheClient.client.addEventListener(
      dhe.Client.EVENT_CONFIG_REMOVED,
      onConfigRemoved
    );

    this._removeConfigListeners = (): void => {
      removeAdded();
      removeUpdated();
      removeRemoved();
    };
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
   * Whether the given query name belongs to a worker this extension is
   * currently creating. Created workers are named `IC - VS Code - <tagId>`
   * (the iframe create flow may append a `_vN` version suffix), so a prefix
   * match against in-flight tagIds covers both forms. Used to keep the
   * auto-attach event path off a worker the create path owns end-to-end, during
   * the window before its serial is known and added to `_querySerialSet`.
   * @param queryName The query name from a config event.
   */
  private _isCreatingQuery = (queryName: string): boolean => {
    for (const tagId of this._creatingTagIds) {
      if (queryName.startsWith(createQueryName(tagId))) {
        return true;
      }
    }
    return false;
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

    const queryName = createQueryName(tagId);

    // Suppress auto-attach for this worker while it is being created. The
    // config event that flips it to `Running` would otherwise race the create
    // path and auto-attach it (see `onDidWorkerAttachable` guard). Cleared in
    // the `finally` below, by which point its serial is in `_querySerialSet`
    // (added synchronously right after, with no `await` in between), so the
    // serial-based guard takes over without a gap.
    this._creatingTagIds.add(tagId);
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
      this._creatingTagIds.delete(tagId);
    }

    if (querySerial == null) {
      throw new Error('Failed to create query.');
    }
    this._querySerialSet.add(querySerial);

    const workerInfo = await getWorkerInfoFromQuery(
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
   * Attach to a pre-existing Running worker by building WorkerInfo from the
   * given QueryInfo. Does NOT add the serial to `_querySerialSet` — attached
   * workers are never owned and must never be deleted by the extension.
   * @param queryInfo The already-Running QueryInfo for the worker to attach.
   * @returns WorkerInfo for the attached worker.
   */
  attachWorker = (queryInfo: QueryInfo): WorkerInfo => {
    const tagId = uniqueId();
    const workerInfo = buildWorkerInfo(tagId, queryInfo);
    if (workerInfo == null) {
      throw new Error(
        `Cannot attach worker: queryInfo.designated is null for serial ${queryInfo.serial}`
      );
    }
    this._workerInfoMap.set(workerInfo.workerUrl, workerInfo);
    return workerInfo;
  };

  /**
   * List all running InteractiveConsole workers owned by the current effective
   * user.
   * @returns A promise resolving to the filtered QueryInfo array.
   */
  listAttachableWorkers = async (): Promise<QueryInfo[]> => {
    const dheClient = await this.getClient(false);
    if (dheClient == null) {
      return [];
    }
    return listAttachableWorkersHelper(dheClient.client);
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

    const isOwned = this._querySerialSet.has(workerInfo.serial);

    this._querySerialSet.delete(workerInfo.serial);
    this._workerInfoMap.delete(workerUrl);

    if (isOwned) {
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
    const querySerials = [...this._querySerialSet];

    this._querySerialSet.clear();
    this._removeConfigListeners?.();
    this._removeConfigListeners = null;
    this._onDidWorkerAttachable.dispose();
    this._onDidWorkerRemoved.dispose();

    await Promise.all([
      this._workerInfoMap.dispose(),
      this._disposeQueries(querySerials),
    ]);
  };
}
