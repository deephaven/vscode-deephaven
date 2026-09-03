import * as vscode from 'vscode';
import type {
  EnterpriseDhType as DheType,
  QueryInfo,
} from '@deephaven-enterprise/jsapi-types';
import { INTERACTIVE_CONSOLE_QUERY_TYPE } from '../common';
import type {
  IAsyncCacheService,
  IDheService,
  IPersistentQueryService,
  IServerManager,
} from '../types';
import { Logger } from '../util';
import { DisposableBase } from './DisposableBase';
import {
  QueryConfigTableService,
  type QueryInfoTableSubscription,
} from './QueryConfigTableService';

const logger = new Logger('PersistentQueryService');

/**
 * Per-DHE-server source of the ACL-visible persistent queries, shared by every
 * view that lists PQs.
 *
 * Serials come from the ticking `QueryInfo` table (server-side filtered to
 * non-InteractiveConsole / non-helper types, any status) and are resolved to
 * full `QueryInfo` objects via `getKnownConfigs()` — the table rows carry no
 * `designated` block, which is where a PQ's status and exported objects live.
 * `onDidUpdate` fires on every table tick so consumers can refresh.
 */
export class PersistentQueryService
  extends DisposableBase
  implements IPersistentQueryService
{
  /**
   * @param serverManager Server manager (for disconnect teardown).
   * @param dheServiceCache Cache providing the DHE service per server URL.
   * @param dheJsApiCache Cache providing the DHE JS API per server URL.
   */
  constructor(
    serverManager: IServerManager,
    dheServiceCache: IAsyncCacheService<URL, IDheService>,
    dheJsApiCache: IAsyncCacheService<URL, DheType>
  ) {
    super();
    this._dheServiceCache = dheServiceCache;
    this._dheJsApiCache = dheJsApiCache;

    // Tear down per-server table subscriptions for any server that goes away
    // (disconnect / config change removing the server).
    this.disposables.add(
      serverManager.onDidDisconnect(url => {
        this._disposeServer(url);
      })
    );
  }

  private readonly _dheServiceCache: IAsyncCacheService<URL, IDheService>;
  private readonly _dheJsApiCache: IAsyncCacheService<URL, DheType>;

  private readonly _onDidUpdate = new vscode.EventEmitter<void>();
  readonly onDidUpdate = this._onDidUpdate.event;

  /** One `QueryConfigTableService` per DHE server URL. */
  private readonly _tableServiceMap = new Map<
    string,
    QueryConfigTableService
  >();
  /** The ticking `QueryInfo` table subscription per DHE server URL. */
  private readonly _subscriptionMap = new Map<
    string,
    Promise<QueryInfoTableSubscription>
  >();

  /**
   * Get (creating if needed) the ticking `QueryInfo` table subscription for a
   * DHE server. Cached per server; every tick re-fires `onDidUpdate`.
   * @param serverUrl The DHE server URL.
   */
  private _getSubscription = (
    serverUrl: URL
  ): Promise<QueryInfoTableSubscription> => {
    const key = serverUrl.toString();

    let subscriptionPromise = this._subscriptionMap.get(key);
    if (subscriptionPromise != null) {
      return subscriptionPromise;
    }

    subscriptionPromise = (async (): Promise<QueryInfoTableSubscription> => {
      const dheService = await this._dheServiceCache.get(serverUrl);

      let tableService = this._tableServiceMap.get(key);
      if (tableService == null) {
        tableService = new QueryConfigTableService(
          serverUrl,
          dheService,
          this._dheJsApiCache
        );
        this._tableServiceMap.set(key, tableService);
        this.disposables.add(tableService);
      }

      // Server-side filter: exclude InteractiveConsole + other helper/system
      // query types. Deliberately unfiltered by status so stopped / failed PQs
      // still list (their state is rendered on the node).
      const subscription = await tableService.getQueryInfoTable({
        excludeHelperTypes: true,
      });

      this.disposables.add(
        subscription.onDidUpdate(() => {
          this._onDidUpdate.fire();
        })
      );

      return subscription;
    })();

    this._subscriptionMap.set(key, subscriptionPromise);

    // If the table fails to load (e.g. WebClientData unavailable), drop the
    // cached rejection so a later refresh can retry.
    subscriptionPromise.catch(err => {
      logger.error(`Failed to load QueryInfo table for ${serverUrl}:`, err);
      if (this._subscriptionMap.get(key) === subscriptionPromise) {
        this._subscriptionMap.delete(key);
      }
    });

    return subscriptionPromise;
  };

  /**
   * Dispose the table subscription + service for a server (on disconnect).
   * @param serverUrl The DHE server URL.
   */
  private _disposeServer = (serverUrl: URL): void => {
    const key = serverUrl.toString();

    const subscriptionPromise = this._subscriptionMap.get(key);
    this._subscriptionMap.delete(key);
    if (subscriptionPromise != null) {
      void subscriptionPromise
        .then(subscription => subscription.dispose())
        .catch(() => {
          // Ignore — already logged / disposed.
        });
    }

    const tableService = this._tableServiceMap.get(key);
    this._tableServiceMap.delete(key);
    if (tableService != null) {
      this.disposables.delete(tableService);
      void tableService.dispose();
    }

    this._onDidUpdate.fire();
  };

  /**
   * The persistent queries visible on a DHE server, sorted by name. Any status
   * (running, stopped, failed) — InteractiveConsole workers are never included;
   * those belong to the Interactive Consoles tree.
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
        queryInfo.serial != null &&
        serials.has(String(queryInfo.serial)) &&
        // Defense in depth: never list InteractiveConsole workers here (they
        // live in the Interactive Consoles tree).
        queryInfo.type !== INTERACTIVE_CONSOLE_QUERY_TYPE
    );

    logger.debug(
      `PQs for ${serverUrl.href}: table serials=${serials.size}, known configs=${knownConfigs.length}, resolved=${queries.length}`
    );

    return queries.sort((a, b) => a.name.localeCompare(b.name));
  };

  protected override async onDisposing(): Promise<void> {
    this._onDidUpdate.dispose();
  }
}
