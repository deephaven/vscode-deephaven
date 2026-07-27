import * as vscode from 'vscode';
import type { QueryInfo } from '@deephaven-enterprise/jsapi-types';
import type { EnterpriseDhType as DheType } from '@deephaven-enterprise/jsapi-types';
import { INTERACTIVE_CONSOLE_QUERY_TYPE } from '../common';
import type {
  IAsyncCacheService,
  IDheService,
  IServerManager,
  PersistentQueryNode,
  PersistentQueryTreeNode,
} from '../types';
import { ServerTreeProviderBase } from './ServerTreeProviderBase';
import {
  getConnectionServerLabel,
  getPanelVariableTreeItem,
  getPersistentQueryObjectLeaves,
  getPersistentQueryServerTreeItem,
  getPersistentQueryTreeItem,
  isPersistentQueryNode,
  Logger,
} from '../util';
import {
  QueryConfigTableService,
  type QueryInfoTableSubscription,
} from '../services';

const logger = new Logger('PersistentQueryTreeProvider');

/**
 * Tree data provider backing the **Persistent Queries** view. Lists ACL-visible
 * non-InteractiveConsole persistent queries (from the ticking `QueryInfo` table)
 * grouped under their DHE server, each expandable to its exported objects.
 * Selecting an object opens it read-only via `OPEN_VARIABLE_PANELS_CMD` — the
 * same panel path the Panels tree uses. Browse-only: no console session, no
 * "attach", and the server-side PQ is never deleted.
 *
 * Tree shape (mirrors `ServerConnectionPanelTreeProvider`):
 *   root      → DHE `ServerState[]`
 *   server    → `PersistentQueryNode[]`  (filtered `QueryInfo` from the table)
 *   PQ        → `[URL, VariableDefintion][]`  (object leaves, opened on click)
 */
export class PersistentQueryTreeProvider extends ServerTreeProviderBase<PersistentQueryTreeNode> {
  constructor(
    serverManager: IServerManager,
    dheServiceCache: IAsyncCacheService<URL, IDheService>,
    dheJsApiCache: IAsyncCacheService<URL, DheType>
  ) {
    super(serverManager);
    this._dheServiceCache = dheServiceCache;
    this._dheJsApiCache = dheJsApiCache;

    // Tear down per-server table subscriptions for any server that goes away
    // (disconnect / config change removing the server).
    this.disposables.add(
      this.serverManager.onDidDisconnect(url => {
        this._disposeServer(url);
      })
    );
  }

  private readonly _dheServiceCache: IAsyncCacheService<URL, IDheService>;
  private readonly _dheJsApiCache: IAsyncCacheService<URL, DheType>;

  /** One `QueryConfigTableService` per DHE server URL. */
  private readonly _tableServiceMap = new Map<string, QueryConfigTableService>();
  /** The ticking `QueryInfo` table subscription per DHE server URL. */
  private readonly _subscriptionMap = new Map<
    string,
    Promise<QueryInfoTableSubscription>
  >();

  /**
   * Get (creating if needed) the ticking `QueryInfo` table subscription for a
   * DHE server, filtered to running non-InteractiveConsole PQs. Refreshes the
   * tree on every table tick. Cached per server.
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

      // Server-side filter: running PQs, excluding InteractiveConsole + other
      // helper/system query types (`excludeHelperTypes`). See Decision 3.
      const subscription = await tableService.getQueryInfoTable({
        statuses: ['Running'],
        excludeHelperTypes: true,
      });

      // Refresh the tree whenever the filtered PQ set ticks.
      this.disposables.add(
        subscription.onDidUpdate(() => {
          this._onDidChangeTreeData.fire();
        })
      );

      return subscription;
    })();

    this._subscriptionMap.set(key, subscriptionPromise);

    // If the table fails to load (e.g. WebClientData unavailable), drop the
    // cached rejection so a later refresh can retry.
    subscriptionPromise.catch(err => {
      logger.error(
        `Failed to load QueryInfo table for ${serverUrl}:`,
        err
      );
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

    this._onDidChangeTreeData.fire();
  };

  /**
   * Read the filtered set of running non-IC PQ serials from the table
   * subscription, then resolve each to a full `QueryInfo` via
   * `getKnownConfigs()` (Gotcha 5 — the table rows lack `designated`). Excludes
   * child-replica rows (`parentId != null`) and any InteractiveConsole type
   * that slipped through (Gotcha 4 — defense in depth).
   * @param serverUrl The DHE server URL.
   */
  private _getPersistentQueries = async (
    serverUrl: URL
  ): Promise<QueryInfo[]> => {
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

    const { table } = subscription;

    // Read the visible (filtered) serials from the table viewport, excluding
    // child-replica rows (`Parent` set) — see Decision 3 / Gotcha 4.
    const serialColumn = table.findColumn('Serial');
    const parentColumn = table.findColumn('Parent');
    const viewportData = await table.getViewportData();

    const filteredSerials = new Set<string>();
    for (const row of viewportData.rows) {
      const parent = row.get(parentColumn);
      if (parent != null && String(parent).length > 0) {
        continue;
      }
      filteredSerials.add(String(row.get(serialColumn)));
    }

    // Resolve serial → full QueryInfo (carries name/owner/status/objects).
    return dheClient.client
      .getKnownConfigs()
      .filter(
        queryInfo =>
          queryInfo.serial != null &&
          filteredSerials.has(String(queryInfo.serial)) &&
          // Defense in depth: never list InteractiveConsole workers here (they
          // live in the WORKERS tree).
          queryInfo.type !== INTERACTIVE_CONSOLE_QUERY_TYPE
      );
  };

  getTreeItem = (
    node: PersistentQueryTreeNode
  ): vscode.TreeItem => {
    // Object leaf node (worker URL + variable). Reuse the Panels tree renderer
    // so the click command is `OPEN_VARIABLE_PANELS_CMD` verbatim.
    if (Array.isArray(node)) {
      return getPanelVariableTreeItem(node);
    }

    // Persistent-query node.
    if (isPersistentQueryNode(node)) {
      return getPersistentQueryTreeItem(node);
    }

    // DHE server node grouping its persistent queries.
    return getPersistentQueryServerTreeItem(node);
  };

  getChildren = async (
    elementOrRoot?: PersistentQueryTreeNode
  ): Promise<PersistentQueryTreeNode[]> => {
    // Root: one node per connected DHE server.
    if (elementOrRoot == null) {
      return this.serverManager
        .getServers({ type: 'DHE' })
        .filter(server => server.isConnected)
        .sort((a, b) =>
          getConnectionServerLabel(a).localeCompare(getConnectionServerLabel(b))
        );
    }

    // Object leaves have no children.
    if (Array.isArray(elementOrRoot)) {
      return [];
    }

    // PQ node → its exported object leaves. Objects come straight off the
    // running PQ's `designated.objects` (no console session, no connect-on-
    // expand needed — the QueryInfo already carries them). The worker URL is
    // registered as a browse connection so the embed panel can authenticate.
    if (isPersistentQueryNode(elementOrRoot)) {
      const { dheServerUrl, queryInfo } = elementOrRoot;

      const workerInfo = await this.serverManager.registerBrowseConnection(
        dheServerUrl,
        queryInfo
      );

      if (workerInfo == null) {
        return [];
      }

      return getPersistentQueryObjectLeaves(
        new URL(workerInfo.workerUrl),
        queryInfo
      );
    }

    // Server node → its filtered persistent queries.
    const serverUrl = elementOrRoot.url;
    const queries = await this._getPersistentQueries(serverUrl);

    return queries
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(
        (queryInfo): PersistentQueryNode => ({ dheServerUrl: serverUrl, queryInfo })
      );
  };
}
