import { z } from 'zod';
import type { dh as DhType } from '@deephaven/jsapi-types';

export const sortDirectionSchema = z.enum(['asc', 'desc']);

export const filterOperationSchema = z.enum([
  'contains',
  'containsIgnoreCase',
  'eq',
  'eqIgnoreCase',
  'greaterThan',
  'greaterThanOrEqualTo',
  'in',
  'inIgnoreCase',
  'isFalse',
  'isNull',
  'isTrue',
  'lessThan',
  'lessThanOrEqualTo',
  'matches',
  'matchesIgnoreCase',
  'notEq',
  'notEqIgnoreCase',
  'notIn',
  'notInIgnoreCase',
]);

export const filterValueTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'datetime',
]);

export const aggregationOperationSchema = z.enum([
  'Count',
  'Min',
  'Max',
  'Sum',
  'Avg',
  'Var',
  'Std',
  'First',
  'Last',
  'Skip',
]);

type FilterOperationSchema = z.infer<typeof filterOperationSchema>;
type FilterValueTypeSchema = z.infer<typeof filterValueTypeSchema>;
type SortDirectionSchema = z.infer<typeof sortDirectionSchema>;
type AggregationOperationSchema = z.infer<typeof aggregationOperationSchema>;

/**
 * Build an aggregation operation map from aggregation specs.
 * @param aggregations Array of aggregation specs
 * @returns Map of column names to operation arrays
 */
export function buildAggregationOperationMap(
  aggregations: Array<{
    column: string;
    operation: AggregationOperationSchema;
  }>
): Record<string, string[]> {
  const operationMap: Record<string, string[]> = {};

  for (const agg of aggregations) {
    if (!operationMap[agg.column]) {
      operationMap[agg.column] = [];
    }
    operationMap[agg.column].push(agg.operation);
  }

  return operationMap;
}

/**
 * Convert column statistics to plain objects.
 * @param columnStats Column statistics from DH
 * @returns Object with statistics and uniqueValues records
 */
export function convertColumnStatsToRecords({
  statisticsMap,
  uniqueValues,
}: DhType.ColumnStatistics): {
  statistics: Record<string, unknown>;
  uniqueValues: Record<string, number>;
} {
  return {
    statistics: Object.fromEntries(statisticsMap),
    uniqueValues: Object.fromEntries(uniqueValues),
  };
}

/**
 * Create filter conditions from filter specs.
 * @param dh DH API
 * @param table Table to filter
 * @param filters Filter specs
 * @returns Array of filter conditions
 */
export function createFilterConditions(
  dh: typeof DhType,
  table: DhType.Table | DhType.TotalsTable,
  filters: Array<{
    column: string;
    operation: FilterOperationSchema;
    value?: unknown;
    valueType?: FilterValueTypeSchema;
  }>
): DhType.FilterCondition[] {
  return filters.map(({ column: columnName, operation, value, valueType }) => {
    const column = table.findColumn(columnName);
    const columnFilter = column.filter();

    switch (operation) {
      case 'isFalse':
      case 'isNull':
      case 'isTrue':
        return columnFilter[operation]();

      case 'in':
      case 'inIgnoreCase':
      case 'notIn':
      case 'notInIgnoreCase': {
        if (!Array.isArray(value)) {
          throw new Error(
            `Filter operation '${operation}' requires an array value`
          );
        }
        if (!valueType) {
          throw new Error(
            `Filter operation '${operation}' requires 'valueType' field`
          );
        }

        const filterValues = value.map(v =>
          createFilterValue(dh, v, valueType)
        );

        return columnFilter[operation](filterValues);
      }

      case 'contains':
      case 'containsIgnoreCase':
      case 'eq':
      case 'eqIgnoreCase':
      case 'greaterThan':
      case 'greaterThanOrEqualTo':
      case 'lessThan':
      case 'lessThanOrEqualTo':
      case 'matches':
      case 'matchesIgnoreCase':
      case 'notEq':
      case 'notEqIgnoreCase': {
        if (value == null || valueType == null) {
          throw new Error(
            `Filter operation '${operation}' requires 'value' and 'valueType' fields`
          );
        }
        const filterValue = createFilterValue(dh, value, valueType);
        return columnFilter[operation](filterValue);
      }

      default:
        throw new Error(`Unsupported filter operation: ${operation}`);
    }
  });
}

/**
 * Create a DH filter value from a primitive value.
 * @param dh DH API
 * @param value Value to convert
 * @param valueType Type of the value
 * @returns DH filter value
 */
export function createFilterValue(
  dh: typeof DhType,
  value: unknown,
  valueType: FilterValueTypeSchema
): DhType.FilterValue {
  switch (valueType) {
    case 'string':
      return dh.FilterValue.ofString(String(value));
    case 'number':
      return dh.FilterValue.ofNumber(Number(value));
    case 'boolean':
      return dh.FilterValue.ofBoolean(Boolean(value));
    case 'datetime':
      const dateValue =
        value instanceof Date ? value : new Date(value as string | number);
      return dh.FilterValue.ofNumber(dateValue.getTime());
    default:
      throw new Error(`Unsupported filter value type: ${valueType}`);
  }
}

/**
 * Create DH sorts from sort specs.
 * @param table Table to sort
 * @param sortBy Sort specs
 * @returns Array of DH sorts
 */
export function createSorts(
  table: DhType.Table | DhType.TotalsTable,
  sortBy: Array<{
    column: string;
    direction?: SortDirectionSchema;
  }>
): DhType.Sort[] {
  return sortBy.map(sort => {
    const column = table.findColumn(sort.column);
    return sort.direction === 'desc'
      ? column.sort().desc()
      : column.sort().asc();
  });
}

/**
 * Format table columns with metadata.
 * @param columns Array of DH columns
 * @returns Array of formatted column objects
 */
export function formatTableColumns(columns: DhType.Column[]): Array<{
  name: string;
  type: string;
  description?: string;
}> {
  return columns.map(col => ({
    name: col.name,
    type: col.type,
    description: col.description ?? undefined,
  }));
}

/**
 * Format a table row for JSON serialization.
 * @param row DH row
 * @param columns Array of DH columns
 * @returns Plain object with formatted values
 */
export function formatTableRow(
  row: DhType.Row,
  columns: DhType.Column[]
): Record<string, unknown> {
  const rowObj: Record<string, unknown> = {};
  for (const col of columns) {
    const value = row.get(col);
    rowObj[col.name] = formatValue(value);
  }
  return rowObj;
}

/**
 * Format a value for JSON serialization.
 * @param value Value to format
 * @returns Formatted value
 */
export function formatValue(value: unknown): unknown {
  if (value == null) {
    return null;
  }

  if (typeof value === 'object') {
    return value.valueOf();
  }

  return value;
}
