import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import {
  fetchQueryConfigTable,
  QueryColumns,
  QUERY_CONFIG_TABLE,
  WEB_CLIENT_DATA_CORE_QUERY,
} from '@deephaven-enterprise/query-utils';
import {
  QUERY_INFO_UPDATE_INTERVAL_MS,
  WebClientDataUnavailableError,
} from '../common';
import { subscribeToColumns } from '../dh/dhc';
import type {
  IDheService,
  QueryInfoTableSubscription,
  QueryTableFilters,
} from '../types';
import {
  closeTableQuietly,
  createThrottledTrigger,
  getQueryTableFilters,
  Logger,
} from '../util';
import { DisposableBase } from './DisposableBase';

const logger = new Logger('QueryConfigTableService');

/**
 * Exposes a server-side-filtered, ticking subscription over the Core+
 * `QueryInfo` table, built on the server's `CorePlusManager`.
 */
export class QueryConfigTableService extends DisposableBase {
  /**
   * @param serverUrl The DHE server URL this service is scoped to.
   * @param dheService The DHE service providing the authenticated client and
   * the `CorePlusManager`.
   */
  constructor(serverUrl: URL, dheService: IDheService) {
    super();
    this._serverUrl = serverUrl;
    this._dheService = dheService;
  }

  private readonly _serverUrl: URL;
  private readonly _dheService: IDheService;

  /**
   * Fetch the (unfiltered) `QueryInfo` table via the WebClientData factory
   * service, along with the Core+ API that created it.
   * @returns The `QueryInfo` table and the Core+ API that created it. The two
   * travel together because filters must be built from the table's own API —
   * see `getQueryTableFilters`.
   */
  private async _fetchQueryInfoTable(): Promise<{
    table: DhcType.Table;
    coreApi: typeof DhcType;
  }> {
    const dheClient = await this._dheService.getClient(false);
    if (dheClient == null) {
      throw new Error(`DHE client is not available for ${this._serverUrl}.`);
    }

    const corePlusManager = await this._dheService.getCorePlusManager();
    if (corePlusManager == null) {
      throw new Error(
        `CorePlusManager is not available for ${this._serverUrl}.`
      );
    }

    // Ensure WebClientData query is running
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

    const table = await fetchQueryConfigTable({
      corePlusManager,
      tableName: QUERY_CONFIG_TABLE,
    });

    try {
      const coreApi = await corePlusManager.getApi(
        webClientData.workerKind,
        webClientData.designated.jsApiUrl
      );

      return { table, coreApi };
    } catch (err) {
      closeTableQuietly(table);
      throw err;
    }
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

    let tableSubscription: DhcType.TableSubscription | undefined;

    try {
      table.applyFilter(getQueryTableFilters(coreApi, table, filters));

      const onDidUpdateEmitter = new vscode.EventEmitter<void>();

      const serialColumn = table.findColumn(QueryColumns.SERIAL.name);
      const statusColumn = table.findColumn(QueryColumns.STATUS.name);

      let querySerials: ReadonlySet<string> = new Set();

      tableSubscription = subscribeToColumns(table, [
        serialColumn,
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
            const serials = new Set(
              detail.rows.map(row => String(row.get(serialColumn)))
            );

            // Updated on every tick so `getQuerySerials` is never stale; only
            // the throttledUpdate notification is rate limited.
            querySerials = serials;
            throttledUpdate.trigger();
          }
        );

      const subscription: QueryInfoTableSubscription = {
        table,
        onDidUpdate: onDidUpdateEmitter.event,
        getQuerySerials: () => querySerials,
        dispose: async (): Promise<void> => {
          // Local teardown; neither of these can throw.
          throttledUpdate.dispose();
          onDidUpdateEmitter.dispose();

          try {
            removeUpdateListener();
          } catch (err) {
            logger.debug('Error removing QueryInfo update listener', err);
          }

          try {
            tableSubscription?.close();
          } catch (err) {
            logger.debug('Error closing QueryInfo table subscription', err);
          }

          closeTableQuietly(table);
        },
      };

      this.disposables.add(subscription);

      return subscription;
    } catch (err) {
      try {
        tableSubscription?.close();
      } catch (closeErr) {
        logger.debug('Error closing QueryInfo table subscription', closeErr);
      }
      closeTableQuietly(table);
      throw err;
    }
  };
}
