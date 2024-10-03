import type { dh as DhcType } from '@deephaven/jsapi-types';
import type {
  EnterpriseDhType as DheType,
  EnterpriseClient,
  LoginCredentials as DheLoginCredentials,
} from '@deephaven-enterprise/jsapi-types';
import type {
  ICacheService,
  IDheService,
  IDheServiceFactory,
  WorkerInfo,
} from '../types';
import { URLMap } from './URLMap';
import { assertDefined, Logger } from '../util';
import {
  createCoreWorker,
  deleteWorker,
  getWorkerCredentials,
  hasInteractivePermission,
} from '../dh/dhe';

const logger = new Logger('DheService');

// TODO: Dev only to avoid storing credentials in the codebase. Will implement
// proper credential management later.
const HACK_USERNAME = process.env.VSCODE_DHE_USER!;
assertDefined(HACK_USERNAME, 'VSCODE_DHE_USER must be defined');

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
    coreCredentialsCache: URLMap<() => Promise<DhcType.LoginCredentials>>,
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
    coreCredentialsCache: URLMap<() => Promise<DhcType.LoginCredentials>>,
    dheClientCache: ICacheService<URL, EnterpriseClient>,
    dheCredentialsCache: URLMap<DheLoginCredentials>,
    dheJsApiCache: ICacheService<URL, DheType>
  ) {
    this.serverUrl = serverUrl;
    this._coreCredentialsCache = coreCredentialsCache;
    this._dheClientCache = dheClientCache;
    this._dheCredentialsCache = dheCredentialsCache;
    this._dheJsApiCache = dheJsApiCache;
    this._workerInfoMap = new URLMap<WorkerInfo>();
  }

  private _isConnected: boolean = false;
  private _initPromise: Promise<EnterpriseClient | null> | null = null;
  private _workerCount: number = 0;
  private readonly _coreCredentialsCache: URLMap<
    () => Promise<DhcType.LoginCredentials>
  >;
  private readonly _dheClientCache: ICacheService<URL, EnterpriseClient>;
  private readonly _dheCredentialsCache: URLMap<DheLoginCredentials>;
  private readonly _dheJsApiCache: ICacheService<URL, DheType>;
  private readonly _workerInfoMap: URLMap<WorkerInfo>;

  readonly serverUrl: URL;

  get isConnected(): boolean {
    return this._isConnected;
  }

  get workerCount(): number {
    return this._workerCount;
  }

  getWorkerInfo = (workerUrl: URL): WorkerInfo | undefined => {
    return this._workerInfoMap.get(workerUrl);
  };

  private _doInit = async (): Promise<EnterpriseClient | null> => {
    const dheClient = await this._dheClientCache.get(this.serverUrl);

    if (!this._dheCredentialsCache.has(this.serverUrl)) {
      // TODO: Login flow
      const dheCredentials = {
        username: HACK_USERNAME,
        token: HACK_USERNAME,
        type: 'password',
      };

      this._dheCredentialsCache.set(this.serverUrl, dheCredentials);
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

  init = async (): Promise<EnterpriseClient | null> => {
    if (this._initPromise == null) {
      this._initPromise = this._doInit();
    }

    const dheClient = await this._initPromise;
    this._isConnected = Boolean(dheClient);

    return dheClient;
  };

  createWorker = async (): Promise<WorkerInfo> => {
    this._workerCount += 1;

    try {
      const dheClient = await this.init();
      if (dheClient == null) {
        const msg =
          'Failed to create worker because DHE client failed to initialize.';
        logger.error(msg);
        throw new Error(msg);
      }

      const dhe = await this._dheJsApiCache.get(this.serverUrl);

      const workerInfo = await createCoreWorker(dhe, dheClient);
      if (workerInfo == null) {
        throw new Error('Failed to create worker.');
      }

      const workerUrl = new URL(workerInfo.grpcUrl);
      this._coreCredentialsCache.set(workerUrl, () =>
        getWorkerCredentials(dheClient)
      );

      this._workerInfoMap.set(workerUrl, workerInfo);

      return workerInfo;
    } catch (err) {
      this._workerCount -= 1;
      throw err;
    }
  };

  deleteWorker = async (workerUrl: URL): Promise<void> => {
    this._workerCount -= 1;

    const workerInfo = await this._workerInfoMap.get(workerUrl);
    if (workerInfo == null) {
      return;
    }

    this._workerInfoMap.delete(this.serverUrl);

    const dheClient = await this.init();
    if (dheClient == null) {
      return;
    }

    deleteWorker(dheClient, workerInfo.serial);
  };

  dispose = async (): Promise<void> => {};
}
