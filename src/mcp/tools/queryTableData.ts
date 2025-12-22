import { z } from 'zod';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import type {
  McpTool,
  McpToolHandlerResult,
  IServerManager,
  IAsyncCacheService,
} from '../../types';
import { DhcService } from '../../services';
import { isInstanceOf } from '../../util';

const sortDirectionSchema = z.enum(['asc', 'desc']);

const sortSpecSchema = z.object({
  column: z.string().describe('Column name to sort by'),
  direction: sortDirectionSchema
    .optional()
    .default('asc')
    .describe('Sort direction (asc or desc)'),
});

const filterOperationSchema = z.enum([
  'eq',
  'eqIgnoreCase',
  'notEq',
  'notEqIgnoreCase',
  'greaterThan',
  'lessThan',
  'greaterThanOrEqualTo',
  'lessThanOrEqualTo',
  'in',
  'inIgnoreCase',
  'notIn',
  'notInIgnoreCase',
  'contains',
  'containsIgnoreCase',
  'matches',
  'matchesIgnoreCase',
  'isTrue',
  'isFalse',
  'isNull',
]);

const filterValueTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'datetime',
]);

const filterSpecSchema = z.object({
  column: z.string().describe('Column name to filter'),
  operation: filterOperationSchema.describe('Filter operation to apply'),
  value: z
    .any()
    .optional()
    .describe('Value to filter by (not needed for isNull, isTrue, isFalse)'),
  valueType: filterValueTypeSchema
    .optional()
    .describe(
      'Type of the filter value (string, number, boolean, datetime). Required if value is provided. Note: datetime uses ofNumber() with timestamp as ofDateTime() is not yet supported.'
    ),
});

const aggregationOperationSchema = z.enum([
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

const aggregationSpecSchema = z.object({
  column: z.string().describe('Column name to aggregate'),
  operation: aggregationOperationSchema.describe(
    'Aggregation operation to apply'
  ),
});

const queryConfigSchema = z.object({
  filters: z
    .array(filterSpecSchema)
    .optional()
    .describe('Array of filter specifications to apply to the table'),
  groupBy: z
    .array(z.string())
    .optional()
    .describe('Column names to group by for aggregations'),
  aggregations: z
    .array(aggregationSpecSchema)
    .optional()
    .describe(
      'Array of aggregation specifications. Each specifies a column and operation.'
    ),
  defaultOperation: aggregationOperationSchema
    .optional()
    .describe(
      'Default aggregation operation for columns not specified in aggregations'
    ),
  sortBy: z
    .array(sortSpecSchema)
    .optional()
    .describe(
      'Array of sort specifications. Applied in order: first sort is primary, second is secondary, etc.'
    ),
});

const spec = {
  title: 'Query Table Data',
  description:
    'Query data from a Deephaven table with support for filtering, sorting, aggregations, and row limiting. Returns data in a format easily represented as a table or values in chat.',
  inputSchema: {
    connectionUrl: z
      .string()
      .describe(
        'Connection URL of the Deephaven server (e.g., "http://localhost:10000")'
      ),
    tableName: z
      .string()
      .describe('Name of the table to query (must exist in the session)'),
    query: queryConfigSchema
      .optional()
      .describe(
        'Query configuration including filters, sorts, and aggregations. All fields are optional.'
      ),
    maxRows: z
      .number()
      .int()
      .positive()
      .max(10000)
      .optional()
      .default(100)
      .describe(
        'Maximum number of rows to return (default: 100, hard limit: 10000). Set lower for large tables to avoid overwhelming responses.'
      ),
  },
  outputSchema: {
    success: z.boolean(),
    data: z
      .array(z.record(z.unknown()))
      .optional()
      .describe('Array of row objects with column values'),
    columns: z
      .array(
        z.object({
          name: z.string(),
          type: z.string(),
        })
      )
      .optional()
      .describe('Column metadata (name and type)'),
    rowCount: z.number().optional().describe('Number of rows returned'),
    totalRows: z
      .number()
      .optional()
      .describe('Total rows in table (before maxRows limit)'),
    message: z.string().optional(),
  },
} as const;

type Spec = typeof spec;
type HandlerResult = McpToolHandlerResult<Spec>;
type QueryTableDataTool = McpTool<Spec>;

/**
 * Create a FilterValue from a value and type.
 * Uses Deephaven FilterValue factory methods: ofString, ofNumber, ofBoolean.
 * Note: ofDateTime is not yet supported, so datetime values use ofNumber with timestamp.
 */
function createFilterValue(
  dh: typeof DhcType,
  value: unknown,
  valueType: string
): DhcType.FilterValue {
  switch (valueType) {
    case 'string':
      return dh.FilterValue.ofString(String(value));
    case 'number':
      return dh.FilterValue.ofNumber(Number(value));
    case 'boolean':
      return dh.FilterValue.ofBoolean(Boolean(value));
    case 'datetime':
      // ofDateTime() is not yet supported per Deephaven docs
      // For DateTime column types, ofNumber() works with values from Row.get
      // For ISO string dates, convert to timestamp
      const dateValue =
        value instanceof Date ? value : new Date(value as string | number);
      return dh.FilterValue.ofNumber(dateValue.getTime());
    default:
      throw new Error(`Unsupported filter value type: ${valueType}`);
  }
}

/**
 * Convert flattened aggregations array to operationMap format for getTotalsTable.
 */
function buildOperationMap(
  aggregations: Array<{
    column: string;
    operation: string;
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
 * Helper to format column values for JSON serialization.
 * Handles special types that don't serialize well (BigInt, Date, etc.)
 */
function formatValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  // Handle other special types as needed
  return value;
}

/**
 * Get table data using JS API client-side operations.
 */
export function createQueryTableDataTool(
  coreJsApiCache: IAsyncCacheService<URL, typeof DhcType>,
  serverManager: IServerManager
): QueryTableDataTool {
  return {
    name: 'queryTableData',
    spec,
    handler: async ({
      connectionUrl,
      tableName,
      query,
      maxRows = 100,
    }: {
      connectionUrl: string;
      tableName: string;
      query?: {
        filters?: Array<{
          column: string;
          operation: string;
          value?: unknown;
          valueType?: string;
        }>;
        groupBy?: string[];
        aggregations?: Array<{ column: string; operation: string }>;
        defaultOperation?: string;
        sortBy?: Array<{
          column: string;
          direction?: 'asc' | 'desc';
        }>;
      };
      maxRows?: number;
    }): Promise<HandlerResult> => {
      try {
        // Parse and validate connection URL
        let serverUrl: URL;
        try {
          serverUrl = new URL(connectionUrl);
        } catch (e) {
          const output = {
            success: false,
            message: `Invalid connection URL: '${connectionUrl}'. Please provide a valid URL (e.g., 'http://localhost:10000').`,
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output,
          };
        }

        // Get connection for this server
        const connection = serverManager.getConnection(serverUrl);

        if (!isInstanceOf(connection, DhcService)) {
          const output = {
            success: false,
            message: `No active connection found for ${connectionUrl}. Use connectToServer to establish a connection first.`,
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output,
          };
        }

        // Ensure the connection is initialized
        if (!connection.isInitialized) {
          await connection.initSession();
        }

        // Get the session for table operations
        const session = connection.getSession();

        if (!session) {
          const output = {
            success: false,
            message: `Unable to access session for ${connectionUrl}. Ensure the server is connected and initialized.`,
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output,
          };
        }

        // Get the base table by name
        const baseTable: DhcType.Table = await session.getObject({
          type: 'Table',
          name: tableName,
        });

        let workingTable: DhcType.Table | DhcType.TotalsTable = baseTable;

        try {
          // Get dh API from cache for filter operations (needed for FilterValue)
          const dh = await coreJsApiCache.get(serverUrl);

          // Apply filters if specified
          if (query?.filters && query.filters.length > 0) {
            const filterConditions: DhcType.FilterCondition[] =
              query.filters.map(filter => {
                const column = workingTable.findColumn(filter.column);
                const columnFilter = column.filter();

                // Operations that don't need a value
                if (filter.operation === 'isNull') {
                  return columnFilter.isNull();
                }
                if (filter.operation === 'isTrue') {
                  return columnFilter.isTrue();
                }
                if (filter.operation === 'isFalse') {
                  return columnFilter.isFalse();
                }

                // Operations that need a value
                if (!filter.value || !filter.valueType) {
                  throw new Error(
                    `Filter operation '${filter.operation}' requires 'value' and 'valueType' fields`
                  );
                }

                // Operations that take arrays
                if (
                  ['in', 'inIgnoreCase', 'notIn', 'notInIgnoreCase'].includes(
                    filter.operation
                  )
                ) {
                  if (!Array.isArray(filter.value)) {
                    throw new Error(
                      `Filter operation '${filter.operation}' requires an array value`
                    );
                  }
                  const filterValues = filter.value.map((v: unknown) =>
                    createFilterValue(dh, v, filter.valueType!)
                  );
                  return (
                    columnFilter as unknown as Record<
                      string,
                      (
                        ...args: DhcType.FilterValue[]
                      ) => DhcType.FilterCondition
                    >
                  )[filter.operation](...filterValues);
                }

                // Single value operations
                const filterValue = createFilterValue(
                  dh,
                  filter.value,
                  filter.valueType
                );
                return (
                  columnFilter as unknown as Record<
                    string,
                    (arg: DhcType.FilterValue) => DhcType.FilterCondition
                  >
                )[filter.operation](filterValue);
              });

            // Apply filters and wait for table to update
            workingTable.applyFilter(filterConditions);
            await new Promise<void>(resolve => {
              const handler = (): void => {
                workingTable.removeEventListener('filterchanged', handler);
                resolve();
              };
              workingTable.addEventListener('filterchanged', handler);
            });
          }

          // Create totals table if aggregation config provided
          if (
            query?.groupBy ||
            query?.aggregations ||
            query?.defaultOperation
          ) {
            const config: Partial<DhcType.TotalsTableConfig> = {};

            if (query.groupBy) {
              config.groupBy = query.groupBy;
            }

            if (query.aggregations && query.aggregations.length > 0) {
              config.operationMap = buildOperationMap(query.aggregations);
            }

            if (query.defaultOperation) {
              config.defaultOperation = query.defaultOperation;
            }

            workingTable = await baseTable.getTotalsTable(
              config as DhcType.TotalsTableConfig
            );
          }

          // Apply client-side sorting if specified
          if (query?.sortBy && query.sortBy.length > 0) {
            const sorts: DhcType.Sort[] = query.sortBy.map(sort => {
              const column = workingTable.findColumn(sort.column);
              return sort.direction === 'desc'
                ? column.sort().desc()
                : column.sort().asc();
            });
            // Apply sort and wait for table to update
            workingTable.applySort(sorts);
            await new Promise<void>(resolve => {
              const handler = (): void => {
                workingTable.removeEventListener('sortchanged', handler);
                resolve();
              };
              workingTable.addEventListener('sortchanged', handler);
            });
          }

          // Get table data
          const totalRows = workingTable.size;
          const rowsToFetch = Math.min(maxRows, totalRows);

          // Set viewport and get data
          workingTable.setViewport(0, rowsToFetch - 1);
          const viewportData = await workingTable.getViewportData();

          // Extract column information
          const columns = workingTable.columns.map(col => ({
            name: col.name,
            type: col.type,
          }));

          // Convert rows to JSON objects
          const data = viewportData.rows.map(row => {
            const rowObj: Record<string, unknown> = {};
            for (const col of workingTable.columns) {
              const value = row.get(col);
              rowObj[col.name] = formatValue(value);
            }
            return rowObj;
          });

          const output = {
            success: true,
            data,
            columns,
            rowCount: data.length,
            totalRows,
            message:
              data.length < totalRows
                ? `Showing ${data.length} of ${totalRows} rows (limited by maxRows=${maxRows})`
                : `Showing all ${totalRows} rows`,
          };

          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output,
          };
        } finally {
          // Always close table subscriptions to free resources
          if (workingTable !== baseTable) {
            workingTable.close();
          }
          baseTable.close();
        }
      } catch (error) {
        const output = {
          success: false,
          message: `Error getting table data: ${error instanceof Error ? error.message : String(error)}`,
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      }
    },
  };
}
