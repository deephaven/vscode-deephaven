import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import type { EnterpriseDhType as DheType } from '@deephaven-enterprise/jsapi-types';
import type { CorePlusManager } from '@deephaven-enterprise/client-utils';
import {
  EXCLUDED_QUERY_TYPES,
  makeFactoryServiceTablePromise,
  QueryColumns,
  QUERY_CONFIG_TABLE,
  WEB_CLIENT_DATA_CORE_QUERY,
} from '@deephaven-enterprise/query-utils';
import { QUERY_INFO_UPDATE_INTERVAL_MS } from '../common';
import type { IAsyncCacheService, IDheService, IDisposable } from '../types';
import { createThrottledTrigger, Logger } from '../util';
import { DisposableBase } from './DisposableBase';

const logger = new Logger('QueryConfigTableService');

/**
 * The community (Core) JS API object returned by `CorePlusManager.getApi`. The
 * `QueryInfo` table is created by the WebClientData worker's community API, so
 * server-side filter values must be built from *this* API — a `FilterValue`
 * from any other API instance (e.g. the enterprise `dhe`) throws a
 * `java.lang.ClassCastException` when the table tries to cast it.
 */
type CoreApi = Awaited<ReturnType<CorePlusManager['getApi']>>;

/**
 * Error thrown when the `WebClientData` Core+ system query required to fetch the
 * `QueryInfo` table is unavailable (not visible to the current user or not
 * running). This surfaces a clear failure instead of hanging (Gotcha 7).
 */
export class WebClientDataUnavailableError extends Error {
  constructor(serverUrl: URL) {
    super(
      `The '${WEB_CLIENT_DATA_CORE_QUERY}' system query is unavailable on ${serverUrl}. ` +
        `The Persistent Queries table cannot be loaded until it is running and visible to you.`
    );
    this.name = 'WebClientDataUnavailableError';
  }
}

/**
 * Server-side filters to apply to the `QueryInfo` table. All fields are
 * optional; only provided fields are applied. Multiple fields are AND'd
 * together. Mirrors iris `PQExplorerPanel.getQueryTableFilters`.
 */
export interface QueryTableFilters {
  /** Restrict to queries owned by these owners (OR'd). */
  owners?: readonly string[];
  /** Restrict to these query types (OR'd), e.g. `InteractiveConsole`. */
  types?: readonly string[];
  /** Restrict to these statuses (OR'd), e.g. `Running`. */
  statuses?: readonly string[];
  /** Case-insensitive substring match against the query name. */
  search?: string;
  /**
   * When true, exclude the query types the PQ explorer never lists (helper /
   * system queries) via `EXCLUDED_QUERY_TYPES`. Defaults to false.
   */
  excludeHelperTypes?: boolean;
}

/**
 * Build the server-side `FilterCondition[]` for the `QueryInfo` table from the
 * given filters. Pure — no I/O or subscription side effects, so it can be unit
 * tested against a mocked table. Mirrors `PQExplorerPanel.getQueryTableFilters`.
 * @param dh The community DH API that created `table`, providing `FilterValue`.
 * Must be the table's own API (see {@link CoreApi}).
 * @param table The `QueryInfo` table to build columns/filters from.
 * @param filters The filters to apply.
 * @returns An array of `FilterCondition` to pass to `table.applyFilter`.
 */
export function getQueryTableFilters(
  dh: CoreApi,
  table: DhcType.Table,
  filters: QueryTableFilters
): DhcType.FilterCondition[] {
  const conditions: DhcType.FilterCondition[] = [];

  const inColumn = (
    columnName: string,
    values: readonly string[]
  ): DhcType.FilterCondition | null => {
    if (values.length === 0) {
      return null;
    }

    const filterValue = table.findColumn(columnName).filter();
    return filterValue.in(values.map(value => dh.FilterValue.ofString(value)));
  };

  const pushIfNonEmpty = (condition: DhcType.FilterCondition | null): void => {
    if (condition != null) {
      conditions.push(condition);
    }
  };

  if (filters.owners != null) {
    pushIfNonEmpty(inColumn(QueryColumns.OWNER.name, filters.owners));
  }

  if (filters.types != null) {
    // Explicit type allow-list takes precedence over the helper-type exclusion.
    pushIfNonEmpty(inColumn(QueryColumns.QUERY_TYPE.name, filters.types));
  } else if (filters.excludeHelperTypes === true) {
    // Exclude the helper/system query types the PQ explorer never lists.
    const excluded = [...EXCLUDED_QUERY_TYPES];
    if (excluded.length > 0) {
      conditions.push(
        table
          .findColumn(QueryColumns.QUERY_TYPE.name)
          .filter()
          .in(excluded.map(value => dh.FilterValue.ofString(value)))
          .not()
      );
    }
  }

  if (filters.statuses != null) {
    pushIfNonEmpty(inColumn(QueryColumns.STATUS.name, filters.statuses));
  }

  if (filters.search != null && filters.search.length > 0) {
    const nameFilter = table.findColumn(QueryColumns.NAME.name).filter();
    conditions.push(
      nameFilter.containsIgnoreCase(dh.FilterValue.ofString(filters.search))
    );
  }

  return conditions;
}

/**
 * A subscription over a filtered `QueryInfo` table. Ticks on every server
 * update (`EVENT_UPDATED`) until disposed, keeping {@link getQuerySerials} in
 * sync with the filtered row set.
 */
export interface QueryInfoTableSubscription extends IDisposable {
  /** The underlying (filtered) `QueryInfo` table. */
  readonly table: DhcType.Table;
  /** Fires on every tick of the filtered row set. */
  readonly onDidUpdate: vscode.Event<void>;
  /**
   * Serials of the current filtered rows, excluding child-replica rows (rows
   * with `Parent` set). Reflects the most recent tick — empty until the first
   * one arrives, so consumers must refresh on {@link onDidUpdate} rather than
   * treating an empty set as "no queries".
   */
  getQuerySerials: () => ReadonlySet<string>;
}

/**
 * Reusable service exposing a server-side-filtered, ticking subscription over
 * the Core+ `QueryInfo` table (built on the `EnterpriseCorePlusManager`
 * substrate). Consumed by the Persistent Queries explorer feature.
 */
export class QueryConfigTableService extends DisposableBase {
  /**
   * @param serverUrl The DHE server URL this service is scoped to.
   * @param dheService The DHE service providing the authenticated client and
   * the `CorePlusManager`.
   * @param dheJsApiCache Cache providing the DHE JS API for `serverUrl`.
   */
  constructor(
    serverUrl: URL,
    dheService: IDheService,
    dheJsApiCache: IAsyncCacheService<URL, DheType>
  ) {
    super();
    this._serverUrl = serverUrl;
    this._dheService = dheService;
    this._dheJsApiCache = dheJsApiCache;
  }

  private readonly _serverUrl: URL;
  private readonly _dheService: IDheService;
  private readonly _dheJsApiCache: IAsyncCacheService<URL, DheType>;

  /**
   * Fetch the (unfiltered) `QueryInfo` table via the WebClientData factory
   * service, along with the community API that created it. Throws a clear error
   * when `WebClientData` is unavailable (Gotcha 7) rather than hanging on the
   * upstream widget-message path.
   * @returns The `QueryInfo` table and the community API that created it. Filter
   * values must be built from that API (see {@link CoreApi}).
   */
  private async _fetchQueryInfoTable(): Promise<{
    table: DhcType.Table;
    coreApi: CoreApi;
  }> {
    const dheClient = await this._dheService.getClient(false);
    if (dheClient == null) {
      throw new Error(
        `Cannot fetch '${QUERY_CONFIG_TABLE}' table: DHE client is not available for ${this._serverUrl}.`
      );
    }

    const corePlusManager = await this._dheService.getCorePlusManager();
    if (corePlusManager == null) {
      throw new Error(
        `Cannot fetch '${QUERY_CONFIG_TABLE}' table: CorePlusManager is not available for ${this._serverUrl}.`
      );
    }

    // Pre-check that the always-on WebClientData system query is visible +
    // running. `makeFactoryServiceTablePromise` routes through a widget-message
    // helper whose rejection is not reliably propagated (upstream DH-20345), so
    // guard here to surface a clear error instead of hanging (Gotcha 7).
    const webClientData = dheClient.client
      .getKnownConfigs()
      .find(
        qi =>
          qi.name === WEB_CLIENT_DATA_CORE_QUERY &&
          qi.designated?.status === 'Running'
      );

    if (webClientData?.designated == null) {
      throw new WebClientDataUnavailableError(this._serverUrl);
    }

    const dhe = await this._dheJsApiCache.get(this._serverUrl);
    const userInfo = await dheClient.client.getUserInfo();

    const table = await makeFactoryServiceTablePromise({
      client: dheClient.client,
      corePlusManager,
      dh: dhe,
      userInfo,
      tableName: QUERY_CONFIG_TABLE,
    });

    // The table is served by the WebClientData worker's *community* API. Grab
    // that same (cached) API instance so filter values are castable by the
    // table — `getApi` returns the instance the factory used above.
    const coreApi = await corePlusManager.getApi(
      webClientData.workerKind,
      webClientData.designated.jsApiUrl
    );

    return { table, coreApi };
  }

  /**
   * Get a filtered, ticking `QueryInfo` table subscription. The returned
   * subscription emits a viewport snapshot on every update and must be disposed
   * by the caller (or with this service).
   * @param filters Server-side filters to apply.
   * @returns The subscription.
   */
  getQueryInfoTable = async (
    filters: QueryTableFilters = {}
  ): Promise<QueryInfoTableSubscription> => {
    const { table, coreApi } = await this._fetchQueryInfoTable();

    const conditions = getQueryTableFilters(coreApi, table, filters);
    table.applyFilter(conditions);

    const onDidUpdateEmitter = new vscode.EventEmitter<void>();

    const serialColumn = table.findColumn(QueryColumns.SERIAL.name);
    const parentColumn = table.findColumn(QueryColumns.PARENT_ID.name);
    const statusColumn = table.findColumn(QueryColumns.STATUS.name);

    let querySerials: ReadonlySet<string> = new Set();

    // Subscribe to the whole filtered table rather than tracking a viewport.
    // A viewport has to be re-pinned as the filtered size changes, and
    // `getViewportData()` only returns the snapshot that has arrived so far, so
    // rows that tick in later were silently dropped (PQs missing from the
    // tree). A full subscription's `EVENT_UPDATED` carries every row the client
    // has, so each tick is a complete picture of the filtered set.
    //
    // Only the columns consumers act on are subscribed, so the table ticks on
    // row add/remove and status transitions but not on churn like heap usage.
    // `Status` earns its place even though the value is unused here: a PQ going
    // Running → Stopped must re-render, and the resolved `QueryInfo` carries the
    // new status.
    const tableSubscription = table.subscribe([
      serialColumn,
      parentColumn,
      statusColumn,
    ]);

    const throttledUpdate = createThrottledTrigger(
      () => onDidUpdateEmitter.fire(),
      QUERY_INFO_UPDATE_INTERVAL_MS
    );

    const removeUpdateListener =
      tableSubscription.addEventListener<DhcType.SubscriptionTableData>(
        coreApi.Table.EVENT_UPDATED,
        ({ detail }) => {
          const serials = new Set<string>();

          for (const row of detail.rows) {
            // Skip child-replica rows; the parent row represents the query.
            const parent = row.get(parentColumn);
            if (parent != null && String(parent).length > 0) {
              continue;
            }
            serials.add(String(row.get(serialColumn)));
          }

          // The serial set is updated on every tick so `getQuerySerials` is
          // never stale; only the notification is rate limited.
          querySerials = serials;
          throttledUpdate.trigger();
        }
      );

    const subscription: QueryInfoTableSubscription = {
      table,
      onDidUpdate: onDidUpdateEmitter.event,
      getQuerySerials: () => querySerials,
      dispose: async (): Promise<void> => {
        removeUpdateListener();
        // Before the emitter, so a pending trailing fire cannot land on a
        // disposed emitter.
        throttledUpdate.dispose();
        onDidUpdateEmitter.dispose();
        try {
          tableSubscription.close();
          table.close();
        } catch (err) {
          logger.debug('Error closing QueryInfo table', err);
        }
      },
    };

    this.disposables.add(subscription);

    return subscription;
  };
}
