import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import type { EnterpriseDhType as DheType } from '@deephaven-enterprise/jsapi-types';
import {
  EXCLUDED_QUERY_TYPES,
  makeFactoryServiceTablePromise,
  QueryColumns,
  QUERY_CONFIG_TABLE,
  WEB_CLIENT_DATA_CORE_QUERY,
} from '@deephaven-enterprise/query-utils';
import type {
  IAsyncCacheService,
  IDheService,
  IDisposable,
} from '../types';
import { Logger } from '../util';
import { DisposableBase } from './DisposableBase';

const logger = new Logger('QueryConfigTableService');

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
 * @param dh The (enterprise) DH API providing `FilterValue`.
 * @param table The `QueryInfo` table to build columns/filters from.
 * @param filters The filters to apply.
 * @returns An array of `FilterCondition` to pass to `table.applyFilter`.
 */
export function getQueryTableFilters(
  dh: DheType,
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

  const pushIfNonEmpty = (
    condition: DhcType.FilterCondition | null
  ): void => {
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
 * A subscription over a filtered `QueryInfo` table. Emits the current set of
 * filtered rows on every server tick (`EVENT_UPDATED`) until disposed.
 */
export interface QueryInfoTableSubscription extends IDisposable {
  /** The underlying (filtered) `QueryInfo` table. */
  readonly table: DhcType.Table;
  /** Fires with a snapshot of the current viewport rows on each update. */
  readonly onDidUpdate: vscode.Event<DhcType.ViewportData>;
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
   * service. Throws a clear error when `WebClientData` is unavailable
   * (Gotcha 7) rather than hanging on the upstream widget-message path.
   * @returns The `QueryInfo` table.
   */
  private async _fetchQueryInfoTable(): Promise<DhcType.Table> {
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
    const hasWebClientData = dheClient.client
      .getKnownConfigs()
      .some(
        qi =>
          qi.name === WEB_CLIENT_DATA_CORE_QUERY &&
          qi.designated?.status === 'Running'
      );

    if (!hasWebClientData) {
      throw new WebClientDataUnavailableError(this._serverUrl);
    }

    const dhe = await this._dheJsApiCache.get(this._serverUrl);
    const userInfo = await dheClient.client.getUserInfo();

    return makeFactoryServiceTablePromise({
      client: dheClient.client,
      corePlusManager,
      dh: dhe,
      userInfo,
      tableName: QUERY_CONFIG_TABLE,
    });
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
    const dhe = await this._dheJsApiCache.get(this._serverUrl);
    const table = await this._fetchQueryInfoTable();

    const conditions = getQueryTableFilters(dhe, table, filters);
    table.applyFilter(conditions);

    const onDidUpdateEmitter =
      new vscode.EventEmitter<DhcType.ViewportData>();

    const onUpdate = ({
      detail,
    }: DhcType.Event<DhcType.ViewportData>): void => {
      onDidUpdateEmitter.fire(detail);
    };

    const removeUpdateListener = table.addEventListener<DhcType.ViewportData>(
      dhe.Table.EVENT_UPDATED,
      onUpdate
    );

    // Subscribe to all rows so the table ticks. The viewport is refreshed as
    // the filtered size changes.
    table.setViewport(0, Math.max(0, table.size - 1));

    const subscription: QueryInfoTableSubscription = {
      table,
      onDidUpdate: onDidUpdateEmitter.event,
      dispose: async (): Promise<void> => {
        removeUpdateListener();
        onDidUpdateEmitter.dispose();
        try {
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
