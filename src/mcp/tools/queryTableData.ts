import { z } from 'zod';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import type {
  McpTool,
  McpToolHandlerArg,
  McpToolHandlerResult,
  IServerManager,
  IAsyncCacheService,
} from '../../types';
import { parseUrl, waitForEvent } from '../../util';
import {
  createMcpToolOutputSchema,
  getFirstConnectionOrCreate,
  McpToolResponse,
} from '../utils';
import {
  aggregationOperationSchema,
  buildAggregationOperationMap,
  createFilterConditions,
  createSorts,
  filterOperationSchema,
  filterValueTypeSchema,
  formatTableRow,
  sortDirectionSchema,
} from '../utils/tableUtils';

const sortSpecSchema = z.object({
  column: z.string().describe('Column name to sort by'),
  direction: sortDirectionSchema
    .optional()
    .default('asc')
    .describe('Sort direction (asc or desc)'),
});

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
  outputSchema: createMcpToolOutputSchema({
    columns: z
      .array(
        z.object({
          name: z.string(),
          type: z.string(),
        })
      )
      .optional()
      .describe('Column metadata (name and type)'),
    connectionUrl: z.string().optional(),
    data: z
      .array(z.record(z.unknown()))
      .optional()
      .describe('Array of row objects with column values'),
    rowCount: z.number().optional().describe('Number of rows returned'),
    tableName: z.string().optional(),
    totalRows: z
      .number()
      .optional()
      .describe('Total rows in table (before maxRows limit)'),
  }),
} as const;

type Spec = typeof spec;
type HandlerArg = McpToolHandlerArg<Spec>;
type HandlerResult = McpToolHandlerResult<Spec>;
type QueryTableDataTool = McpTool<Spec>;

export function createQueryTableDataTool({
  coreJsApiCache,
  serverManager,
}: {
  coreJsApiCache: IAsyncCacheService<URL, typeof DhcType>;
  serverManager: IServerManager;
}): QueryTableDataTool {
  return {
    name: 'queryTableData',
    spec,
    handler: async ({
      connectionUrl,
      tableName,
      query,
      maxRows = 100,
    }: HandlerArg): Promise<HandlerResult> => {
      const response = new McpToolResponse();

      const parsedUrl = parseUrl(connectionUrl);
      if (!parsedUrl.success) {
        return response.error('Invalid URL', parsedUrl.error, {
          connectionUrl,
        });
      }

      try {
        const firstConnectionResult = await getFirstConnectionOrCreate({
          connectionUrl: parsedUrl.value,
          serverManager,
        });

        if (!firstConnectionResult.success) {
          const { details, error, errorMessage, hint } = firstConnectionResult;
          return response.errorWithHint(errorMessage, error, hint, details);
        }

        const { connection } = firstConnectionResult;
        const session = await connection.getSession();

        if (!session) {
          return response.error('Unable to access session', null, {
            connectionUrl,
          });
        }

        const baseTable: DhcType.Table = await session.getObject({
          type: 'Table',
          name: tableName,
        });

        let workingTable: DhcType.Table | DhcType.TotalsTable = baseTable;

        try {
          const dh = await coreJsApiCache.get(parsedUrl.value);

          if (query?.filters && query.filters.length > 0) {
            const filterConditions = createFilterConditions(
              dh,
              workingTable,
              query.filters
            );

            workingTable.applyFilter(filterConditions);
            await waitForEvent(workingTable, 'filterchanged');
          }

          if (
            query?.groupBy ||
            query?.aggregations ||
            query?.defaultOperation
          ) {
            const config: DhcType.TotalsTableConfig = {
              defaultOperation: 'Sum',
              groupBy: query.groupBy ?? [],
              operationMap:
                query.aggregations && query.aggregations.length > 0
                  ? buildAggregationOperationMap(query.aggregations)
                  : {},
              showGrandTotalsByDefault: false,
              showTotalsByDefault: false,
            };

            workingTable = await baseTable.getTotalsTable(config);
          }

          if (query?.sortBy && query.sortBy.length > 0) {
            const sorts = createSorts(workingTable, query.sortBy);
            workingTable.applySort(sorts);
            await waitForEvent(workingTable, 'sortchanged');
          }

          const totalRows = workingTable.size;
          const rowsToFetch = Math.min(maxRows, totalRows);

          workingTable.setViewport(0, rowsToFetch - 1);
          const viewportData = await workingTable.getViewportData();

          const columns = workingTable.columns.map(col => ({
            name: col.name,
            type: col.type,
          }));

          const data = viewportData.rows.map(row =>
            formatTableRow(row, workingTable.columns)
          );

          const message =
            data.length < totalRows
              ? `Showing ${data.length} of ${totalRows} rows`
              : `Showing all ${totalRows} rows`;

          return response.success(message, {
            data,
            columns,
            rowCount: data.length,
            totalRows,
          });
        } finally {
          if (workingTable !== baseTable) {
            workingTable.close();
          }
          baseTable.close();
        }
      } catch (error) {
        return response.error('Failed to query table data', error, {
          connectionUrl,
          tableName,
        });
      }
    },
  };
}
