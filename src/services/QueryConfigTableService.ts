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
 * running).
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
 * tested against a mocked table.
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

  const isIn = (
    columnName: string,
    values: readonly string[]
  ): DhcType.FilterCondition =>
    table
      .findColumn(columnName)
      .filter()
      .in(values.map(value => dh.FilterValue.ofString(value)));

  if (filters.owners != null && filters.owners.length > 0) {
    conditions.push(isIn(QueryColumns.OWNER.name, filters.owners));
  }

  const excludedTypes = [...EXCLUDED_QUERY_TYPES];

  if (filters.types != null && filters.types.length > 0) {
    // An explicit type allow-list takes precedence over the helper exclusion.
    conditions.push(isIn(QueryColumns.QUERY_TYPE.name, filters.types));
  } else if (filters.excludeHelperTypes === true && excludedTypes.length > 0) {
    conditions.push(isIn(QueryColumns.QUERY_TYPE.name, excludedTypes).not());
  }

  if (filters.statuses != null && filters.statuses.length > 0) {
    conditions.push(isIn(QueryColumns.STATUS.name, filters.statuses));
  }

  if (filters.search != null && filters.search.length > 0) {
    conditions.push(
      table
        .findColumn(QueryColumns.NAME.name)
        .filter()
        .containsIgnoreCase(dh.FilterValue.ofString(filters.search))
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
 * Exposes a server-side-filtered, ticking subscription over the Core+
 * `QueryInfo` table, built on the server's `CorePlusManager`.
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
   * service, along with the community API that created it.
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
    // guard here to surface a clear error instead of hanging.
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
   * Get a filtered, ticking `QueryInfo` table subscription. Disposed with this
   * service, or earlier by the caller.
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

    // A full-table subscription rather than a viewport: `EVENT_UPDATED` carries
    // every row the client has, so each tick is a complete picture of the
    // filtered set with no viewport to re-pin as the filtered size changes.
    //
    // Only the columns consumers act on are subscribed, so the table ticks on
    // row add/remove and status transitions but not on churn like heap usage.
    // `Status` is included even though its value is unused here: a PQ going
    // Running -> Stopped must re-render, and the resolved `QueryInfo` carries
    // the new status.
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

          // Updated on every tick so `getQuerySerials` is never stale; only
          // the notification is rate limited.
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
