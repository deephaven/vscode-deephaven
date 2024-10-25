import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import type { EnterpriseDhType as DheType } from '@deephaven-enterprise/jsapi-types';
import {
  WorkerURL,
  type ConsoleType,
  type DheAuthenticatedClient,
  type IAsyncCacheService,
  type IConfigService,
  type IDheService,
  type IDheServiceFactory,
  type IToastService,
  type Lazy,
  type QuerySerial,
  type UniqueID,
  type WorkerConfig,
  type WorkerInfo,
} from '../types';
import { URLMap } from './URLMap';
import { Logger } from '../util';
import {
  createInteractiveConsoleQuery,
  deleteQueries,
  getWorkerCredentials,
  getWorkerInfoFromQuery,
} from '../dh/dhe';
import { CREATE_AUTHENTICATED_CLIENT_CMD } from '../common';

const logger = new Logger('DheService');

/**
 * Service for managing DHE connections, sessions, workers, etc.
 */
export class DheService implements IDheService {
  /**
   * Creates a factory function that can be used to create DheService instances.
   * @param configService Configuration service.
   * @param coreCredentialsCache Core credentials cache.
   * @param dheClientCache DHE client cache.
   * @param dheJsApiCache DHE JS API cache.
   * @param toaster Toast service for notifications.
   * @returns A factory function that can be used to create DheService instances.
   */
  static factory = (
    configService: IConfigService,
    coreCredentialsCache: URLMap<Lazy<DhcType.LoginCredentials>>,
    dheClientCache: URLMap<DheAuthenticatedClient>,
    dheJsApiCache: IAsyncCacheService<URL, DheType>,
    toaster: IToastService
  ): IDheServiceFactory => {
    return {
      create: (serverUrl: URL): IDheService =>
        new DheService(
          serverUrl,
          configService,
          coreCredentialsCache,
          dheClientCache,
          dheJsApiCache,
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
    coreCredentialsCache: URLMap<Lazy<DhcType.LoginCredentials>>,
    dheClientCache: URLMap<DheAuthenticatedClient>,
    dheJsApiCache: IAsyncCacheService<URL, DheType>,
    toaster: IToastService
  ) {
    this.serverUrl = serverUrl;
    this._config = configService;
    this._coreCredentialsCache = coreCredentialsCache;
    this._dheClientCache = dheClientCache;
    this._dheJsApiCache = dheJsApiCache;
    this._querySerialSet = new Set<QuerySerial>();
    this._toaster = toaster;
    this._workerInfoMap = new URLMap<WorkerInfo, WorkerURL>();

    this._dheClientCache.onDidChange(this._onDidDheClientCacheInvalidate);
  }

  private _clientPromise: Promise<DheAuthenticatedClient | null> | null = null;
  private _isConnected: boolean = false;
  private readonly _config: IConfigService;
  private readonly _coreCredentialsCache: URLMap<
    Lazy<DhcType.LoginCredentials>
  >;
  private readonly _dheClientCache: URLMap<DheAuthenticatedClient>;
  private readonly _dheJsApiCache: IAsyncCacheService<URL, DheType>;
  private readonly _querySerialSet: Set<QuerySerial>;
  private readonly _toaster: IToastService;
  private readonly _workerInfoMap: URLMap<WorkerInfo, WorkerURL>;

  readonly serverUrl: URL;

  /**
   * Whether the DHE client is connected.
   */
  get isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Initialize DHE client and login.
   * @returns DHE client or null if initialization failed.
   */
  private _initClient = async (): Promise<DheAuthenticatedClient | null> => {
    if (!this._dheClientCache.has(this.serverUrl)) {
      await vscode.commands.executeCommand(
        CREATE_AUTHENTICATED_CLIENT_CMD,
        this.serverUrl
      );
    }

    return this._dheClientCache.getOrThrow(this.serverUrl);
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
      await deleteQueries(dheClient, querySerials);
    }
  };

  private _onDidDheClientCacheInvalidate = (url: URL): void => {
    if (url.toString() === this.serverUrl.toString()) {
      // Reset the client promise so that the next call to `getClient` can
      // reinitialize it if necessary.
      this._clientPromise = null;
    }
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
   * @returns DHE client or null if not initialized.
   */
  getClient = async (
    initializeIfNull: boolean
  ): Promise<DheAuthenticatedClient | null> => {
    if (this._clientPromise == null) {
      if (!initializeIfNull) {
        return null;
      }

      this._clientPromise = this._initClient();
    }

    const dheClient = await this._clientPromise;
    this._isConnected = Boolean(dheClient);

    if (dheClient == null) {
      this._clientPromise = null;
    }

    return dheClient;
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
    const dheClient = await this.getClient(true);
    if (dheClient == null) {
      const msg =
        'Failed to create worker because DHE client failed to initialize.';
      logger.error(msg);
      throw new Error(msg);
    }

    const dhe = await this._dheJsApiCache.get(this.serverUrl);

    const querySerial = await createInteractiveConsoleQuery(
      tagId,
      dheClient,
      this.getWorkerConfig(),
      consoleType
    );
    this._querySerialSet.add(querySerial);

    const workerInfo = await getWorkerInfoFromQuery(
      tagId,
      dhe,
      dheClient,
      querySerial
    );
    if (workerInfo == null) {
      throw new Error('Failed to create worker.');
    }
    const workerUrl = new URL(workerInfo.grpcUrl);
    this._coreCredentialsCache.set(workerUrl, () =>
      getWorkerCredentials(dheClient)
    );

    this._workerInfoMap.set(workerInfo.grpcUrl, workerInfo);

    return workerInfo;
  };

  /**
   * Delete a worker.
   * @param workerUrl Worker URL to delete.
   */
  deleteWorker = async (workerUrl: WorkerURL): Promise<void> => {
    const workerInfo = this._workerInfoMap.get(workerUrl);
    if (workerInfo == null) {
      return;
    }

    this._querySerialSet.delete(workerInfo.serial);
    this._workerInfoMap.delete(workerUrl);

    await this._disposeQueries([workerInfo.serial]);
  };

  dispose = async (): Promise<void> => {
    const querySerials = [...this._querySerialSet];

    this._querySerialSet.clear();
    this._workerInfoMap.clear();

    await this._disposeQueries(querySerials);
  };
}
