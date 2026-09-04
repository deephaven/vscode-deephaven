import * as vscode from 'vscode';
import type { QueryInfo } from '@deephaven-enterprise/jsapi-types';
import { INTERACTIVE_CONSOLE_QUERY_TYPE } from '../common';
import type {
  IAsyncCacheService,
  IDheService,
  IPersistentQueryService,
  IServerManager,
} from '../types';
import { Logger, URLMap } from '../util';
import { DisposableBase } from './DisposableBase';
import {
  QueryConfigTableService,
  type QueryInfoTableSubscription,
} from './QueryConfigTableService';

const logger = new Logger('PersistentQueryService');

export class PersistentQueryService
  extends DisposableBase
  implements IPersistentQueryService
{
  /**
   * @param serverManager Server manager (for disconnect teardown).
   * @param dheServiceCache Cache providing the DHE service per server URL.
   */
  constructor(
    serverManager: IServerManager,
    dheServiceCache: IAsyncCacheService<URL, IDheService>
  ) {
    super();
    this._dheServiceCache = dheServiceCache;

    // Tear down per-server table subscriptions for any server that goes away
    // (disconnect / config change removing the server).
    this.disposables.add(
      serverManager.onDidDisconnect(url => {
        this._disposeServer(url);
      })
    );
  }

  private readonly _dheServiceCache: IAsyncCacheService<URL, IDheService>;

  private readonly _onDidUpdate = new vscode.EventEmitter<void>();
  readonly onDidUpdate = this._onDidUpdate.event;

  private readonly _tableServiceMap = new URLMap<QueryConfigTableService>();
  private readonly _subscriptionMap = new URLMap<
    Promise<QueryInfoTableSubscription>
  >();

  /**
   * Create the ticking `QueryInfo` table subscription for a DHE server, reusing
   * the server's `QueryConfigTableService` if one already exists.
   * @param serverUrl The DHE server URL.
   */
  private _createSubscription = async (
    serverUrl: URL
  ): Promise<QueryInfoTableSubscription> => {
    const dheService = await this._dheServiceCache.get(serverUrl);

    let tableService = this._tableServiceMap.get(serverUrl);
    if (tableService == null) {
      tableService = new QueryConfigTableService(serverUrl, dheService);
      this._tableServiceMap.set(serverUrl, tableService);
      this.disposables.add(tableService);
    }

    // Server-side filter: exclude InteractiveConsole + other helper/system
    // query types. Status filtering is done client-side so the user can choose
    // to show/hide any status they want.
    const subscription = await tableService.getQueryInfoTable({
      excludeHelperTypes: true,
    });

    this.disposables.add(
      subscription.onDidUpdate(() => {
        this._onDidUpdate.fire();
      })
    );

    return subscription;
  };

  /**
   * Get (creating if needed) the ticking `QueryInfo` table subscription for a
   * DHE server. Cached per server; every tick re-fires `onDidUpdate`.
   * @param serverUrl The DHE server URL.
   */
  private _getSubscription = (
    serverUrl: URL
  ): Promise<QueryInfoTableSubscription> => {
    if (this._subscriptionMap.has(serverUrl)) {
      return this._subscriptionMap.getOrThrow(serverUrl)!;
    }

    const subscriptionPromise = this._createSubscription(serverUrl);
    this._subscriptionMap.set(serverUrl, subscriptionPromise);

    // If the table fails to load (e.g. WebClientData unavailable), drop the
    // cached rejection so a later refresh can retry.
    subscriptionPromise.catch(err => {
      logger.error(`Failed to load QueryInfo table for ${serverUrl}:`, err);
      if (this._subscriptionMap.get(serverUrl) === subscriptionPromise) {
        this._subscriptionMap.delete(serverUrl);
      }
    });

    return subscriptionPromise;
  };

  /**
   * Dispose the table subscription + service for a server (on disconnect).
   * @param serverUrl The DHE server URL.
   */
  private _disposeServer = (serverUrl: URL): void => {
    const subscriptionPromise = this._subscriptionMap.get(serverUrl);
    this._subscriptionMap.delete(serverUrl);
    if (subscriptionPromise != null) {
      void subscriptionPromise
        .then(subscription => subscription.dispose())
        .catch(() => {
          // Ignore — already logged / disposed.
        });
    }

    const tableService = this._tableServiceMap.get(serverUrl);
    this._tableServiceMap.delete(serverUrl);
    if (tableService != null) {
      this.disposables.delete(tableService);
      void tableService.dispose();
    }

    this._onDidUpdate.fire();
  };

  /**
   * The persistent queries visible on a DHE server, in unspecified order. Any
   * status (running, stopped, failed) — InteractiveConsole workers are never
   * included; those belong to the Interactive Consoles tree.
   *
   * Deliberately unsorted: a server can hold tens of thousands of queries, and
   * callers narrow that set before they need an order (or, like
   * `getStatusCounts`, never need one). Sorting here would make every caller
   * pay `localeCompare` over the whole set.
   * @param serverUrl The DHE server URL.
   */
  getPersistentQueryInfos = async (serverUrl: URL): Promise<QueryInfo[]> => {
    const dheService = await this._dheServiceCache.get(serverUrl);
    const dheClient = await dheService.getClient(false);
    if (dheClient == null) {
      return [];
    }

    let subscription: QueryInfoTableSubscription;
    try {
      subscription = await this._getSubscription(serverUrl);
    } catch {
      // Error already logged in `_getSubscription`; show an empty PQ list.
      return [];
    }

    const serials = subscription.getQuerySerials();

    const knownConfigs = dheClient.client.getKnownConfigs();

    const queries = knownConfigs.filter(
      queryInfo =>
        serials.has(queryInfo.serial) &&
        queryInfo.type !== INTERACTIVE_CONSOLE_QUERY_TYPE
    );

    logger.debug(
      `PQs for ${serverUrl.href}: table serials=${serials.size}, known configs=${knownConfigs.length}, resolved=${queries.length}`
    );

    return queries;
  };

  protected override async onDisposing(): Promise<void> {
    this._onDidUpdate.dispose();
  }
}
