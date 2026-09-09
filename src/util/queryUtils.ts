import type { dh as DhcType } from '@deephaven/jsapi-types';
import {
  EXCLUDED_QUERY_TYPES,
  QueryColumns,
} from '@deephaven-enterprise/query-utils';
import { DEFAULT_HIDDEN_QUERY_STATUSES, UNSET_QUERY_STATUS } from '../common';
import type { CoreApi, QueryTableFilters } from '../types';
import { Logger } from './Logger';

const logger = new Logger('queryUtils');

/**
 * Build the server-side filter restricting the table to parent queries.
 * @param table The `QueryInfo` table to build the column filter from.
 * @returns A `FilterCondition` matching parent queries only.
 */
export function getExcludeReplicasFilter(
  table: DhcType.Table
): DhcType.FilterCondition {
  return table.findColumn(QueryColumns.PARENT_ID.name).filter().isNull();
}

/**
 * Build the complete set of server-side `FilterCondition`s for the `QueryInfo`
 * table: the always-on parent-query restriction, followed by whichever of
 * `filters` were provided. The single source of what this extension filters
 * server-side — pass the result straight to `table.applyFilter`.
 * @param dh The core DH API that created `table`, providing `FilterValue`.
 * Must be the table's own API (see {@link CoreApi}).
 * @param table The `QueryInfo` table to build columns/filters from.
 * @param filters The caller's filters. All fields are optional; only provided
 * fields add a condition.
 * @returns An array of `FilterCondition` to pass to `table.applyFilter`.
 */
export function getQueryTableFilters(
  dh: CoreApi,
  table: DhcType.Table,
  filters: QueryTableFilters
): DhcType.FilterCondition[] {
  // Not caller-controlled: no view lists replicas, so this applies whatever
  // else was asked for.
  const conditions: DhcType.FilterCondition[] = [
    getExcludeReplicasFilter(table),
  ];

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
 * Normalise a PQ status to its hidden-set key. `null`, `undefined`, and `''`
 * are all ways the server / JS API report "no status", so they collapse to one
 * entry.
 * @param status The status to normalise.
 */
export function normalizeQueryStatus(
  status: string | null | undefined
): string {
  return status == null ? UNSET_QUERY_STATUS : status;
}

/**
 * Interpret a persisted PQ hidden-status set, falling back to the default only
 * when nothing has ever been stored. An empty stored array means the user
 * deliberately unhid everything, so it must be distinguished from "never set".
 * A value that isn't an array of strings is discarded in favour of the default
 * rather than throwing on startup.
 * @param stored The raw persisted value, straight out of storage.
 */
export function parseHiddenQueryStatuses(stored: unknown): string[] {
  // `Memento.get` is documented to return `undefined` when unset, but it is
  // typed `unknown` here — `== null` also covers a `null` slipping through
  // (which is "no value" too, not a malformed one worth logging).
  if (stored == null) {
    return [...DEFAULT_HIDDEN_QUERY_STATUSES];
  }

  if (
    !Array.isArray(stored) ||
    stored.some(status => typeof status !== 'string')
  ) {
    logger.debug(
      'Discarding malformed persisted PQ status filter:',
      JSON.stringify(stored)
    );
    return [...DEFAULT_HIDDEN_QUERY_STATUSES];
  }

  return stored as string[];
}
