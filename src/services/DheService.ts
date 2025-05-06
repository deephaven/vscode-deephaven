import * as vscode from 'vscode';
import type { AuthenticatedClient as DheAuthenticatedClient } from '@deephaven-enterprise/auth-nodejs';
import type { EnterpriseDhType as DheType } from '@deephaven-enterprise/jsapi-types';
import {
  type ConsoleType,
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
import { URLMap } from './URLMap';
import { isDheCreateQueryUISupported, Logger } from '../util';
import {
  createInteractiveConsoleQuery,
  deleteQueries,
  getWorkerInfoFromQuery,
} from '../dh/dhe';
import { CREATE_DHE_AUTHENTICATED_CLIENT_CMD } from '../common';
import type { QuerySerial } from '../crossModule';

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
    dheClientCache: URLMap<DheAuthenticatedClient>,
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
    dheClientCache: URLMap<DheAuthenticatedClient>,
    dheJsApiCache: IAsyncCacheService<URL, DheType>,
    interactiveConsoleQueryFactory: IInteractiveConsoleQueryFactory,
    toaster: IToastService
  ) {
    this.serverUrl = serverUrl;
    this._config = configService;
    this._dheClientCache = dheClientCache;
    this._dheJsApiCache = dheJsApiCache;
    this._querySerialSet = new Set<QuerySerial>();
    this._interactiveConsoleQueryFactory = interactiveConsoleQueryFactory;
    this._toaster = toaster;
    this._workerInfoMap = new URLMap<WorkerInfo, WorkerURL>();

    this._dheClientCache.onDidChange(this._onDidDheClientCacheInvalidate);
  }

  private _clientPromise: Promise<DheAuthenticatedClient | null> | null = null;
  private _isConnected: boolean = false;
  private readonly _config: IConfigService;
  private readonly _dheClientCache: URLMap<DheAuthenticatedClient>;
  private readonly _dheJsApiCache: IAsyncCacheService<URL, DheType>;
  private readonly _querySerialSet: Set<QuerySerial>;
  private readonly _interactiveConsoleQueryFactory: IInteractiveConsoleQueryFactory;
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
   * @param operateAsAnotherUser Whether to operate as another user.
   * @returns DHE client or null if initialization failed.
   */
  private _initClient = async (
    operateAsAnotherUser: boolean
  ): Promise<DheAuthenticatedClient | null> => {
    if (!this._dheClientCache.has(this.serverUrl)) {
      await vscode.commands.executeCommand(
        CREATE_DHE_AUTHENTICATED_CLIENT_CMD,
        this.serverUrl,
        operateAsAnotherUser
      );
    }

    const maybeClient = await this._dheClientCache.get(this.serverUrl);

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
   * @param operateAsAnotherUser Whether to operate as another user.
   * @returns DHE client or null if not initialized.
   */
  async getClient(
    initializeIfNull: false
  ): Promise<DheAuthenticatedClient | null>;
  async getClient(
    initializeIfNull: true,
    operateAsAnotherUser: boolean
  ): Promise<DheAuthenticatedClient | null>;
  async getClient(
    initializeIfNull: boolean,
    operateAsAnotherUser = false
  ): Promise<DheAuthenticatedClient | null> {
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

    const { gradleVersion } = await dheClient.getServerConfigValues();
    logger.debug('Gradle version:', gradleVersion);
    // HACK: dev only TODO: Update gradle version check
    const isUISupported =
      this.serverUrl.origin === 'https://bmingles-f1.int.illumon.com:8123'; // isDheCreateQueryUISupported(gradleVersion);

    const querySerial = isUISupported
      ? await this._interactiveConsoleQueryFactory(
          this.serverUrl,
          tagId,
          consoleType
        )
      : await createInteractiveConsoleQuery(
          tagId,
          dheClient,
          this.getWorkerConfig(),
          consoleType
        );

    if (querySerial == null) {
      throw new Error('Failed to create query.');
    }
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

    this._workerInfoMap.set(workerInfo.workerUrl, workerInfo);

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

    await Promise.all([
      this._workerInfoMap.dispose(),
      this._disposeQueries(querySerials),
    ]);
  };
}
