import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import type {
  EnterpriseDhType as DheType,
  EnterpriseClient,
  LoginCredentials as DheLoginCredentials,
} from '@deephaven-enterprise/jsapi-types';
import {
  WorkerURL,
  type ConsoleType,
  type ICacheService,
  type IDheService,
  type IDheServiceFactory,
  type Lazy,
  type QuerySerial,
  type UniqueID,
  type WorkerInfo,
} from '../types';
import { URLMap } from './URLMap';
import { Logger } from '../util';
import {
  createInteractiveConsoleQuery,
  deleteQueries,
  getWorkerCredentials,
  getWorkerInfoFromQuery,
  hasInteractivePermission,
} from '../dh/dhe';
import { REQUEST_DHE_USER_CREDENTIALS_CMD } from '../common';

const logger = new Logger('DheService');

/**
 * Service for managing DHE connections, sessions, workers, etc.
 */
export class DheService implements IDheService {
  /**
   * Creates a factory function that can be used to create DheService instances.
   * @param coreCredentialsCache Core credentials cache.
   * @param dheClientCache DHE client cache.
   * @param dheCredentialsCache DHE credentials cache.
   * @param dheJsApiCache DHE JS API cache.
   * @returns A factory function that can be used to create DheService instances.
   */
  static factory = (
    coreCredentialsCache: URLMap<Lazy<DhcType.LoginCredentials>>,
    dheClientCache: ICacheService<URL, EnterpriseClient>,
    dheCredentialsCache: URLMap<DheLoginCredentials>,
    dheJsApiCache: ICacheService<URL, DheType>
  ): IDheServiceFactory => {
    return {
      create: (serverUrl: URL): IDheService =>
        new DheService(
          serverUrl,
          coreCredentialsCache,
          dheClientCache,
          dheCredentialsCache,
          dheJsApiCache
        ),
    };
  };

  /**
   * Private constructor since the static `factory` method is the intended
   * mechanism for instantiating.
   */
  private constructor(
    serverUrl: URL,
    coreCredentialsCache: URLMap<Lazy<DhcType.LoginCredentials>>,
    dheClientCache: ICacheService<URL, EnterpriseClient>,
    dheCredentialsCache: URLMap<DheLoginCredentials>,
    dheJsApiCache: ICacheService<URL, DheType>
  ) {
    this.serverUrl = serverUrl;
    this._coreCredentialsCache = coreCredentialsCache;
    this._dheClientCache = dheClientCache;
    this._dheCredentialsCache = dheCredentialsCache;
    this._dheJsApiCache = dheJsApiCache;
    this._querySerialSet = new Set<QuerySerial>();
    this._workerInfoMap = new URLMap<WorkerInfo, WorkerURL>();
  }

  private _clientPromise: Promise<EnterpriseClient | null> | null = null;
  private _isConnected: boolean = false;
  private readonly _coreCredentialsCache: URLMap<
    Lazy<DhcType.LoginCredentials>
  >;
  private readonly _dheClientCache: ICacheService<URL, EnterpriseClient>;
  private readonly _dheCredentialsCache: URLMap<DheLoginCredentials>;
  private readonly _dheJsApiCache: ICacheService<URL, DheType>;
  private readonly _querySerialSet: Set<QuerySerial>;
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
  private _initClient = async (): Promise<EnterpriseClient | null> => {
    const dheClient = await this._dheClientCache.get(this.serverUrl);

    if (!this._dheCredentialsCache.has(this.serverUrl)) {
      await vscode.commands.executeCommand(
        REQUEST_DHE_USER_CREDENTIALS_CMD,
        this.serverUrl
      );

      if (!this._dheCredentialsCache.has(this.serverUrl)) {
        logger.error(
          'Failed to get DHE credentials for server:',
          this.serverUrl.toString()
        );
        return null;
      }
    }

    const dheCredentials = this._dheCredentialsCache.get(this.serverUrl)!;

    try {
      await dheClient.login(dheCredentials);
    } catch (err) {
      logger.error('An error occurred while connecting to DHE server:', err);
      return null;
    }

    if (!hasInteractivePermission(dheClient)) {
      logger.error('User does not have permission to run queries.');
      return null;
    }

    return dheClient;
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
  ): Promise<EnterpriseClient | null> => {
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
