import { z } from 'zod';
import type {
  McpTool,
  McpToolHandlerArg,
  McpToolHandlerResult,
  IServerManager,
} from '../../types';
import { createMcpToolOutputSchema, McpToolResponse } from '../utils';
import { getTablePage, getTableOrError } from '../utils/tableUtils';

const spec = {
  title: 'Query Table Data',
  description:
    'Fetch data from a Deephaven table with pagination support. Returns a subset of rows based on offset and limit parameters.',
  inputSchema: {
    connectionUrl: z
      .string()
      .describe(
        'Connection URL of the Deephaven server (e.g., "http://localhost:10000")'
      ),
    limit: z
      .number()
      .int()
      .positive()
      .max(10000)
      .optional()
      .default(10)
      .describe(
        'Maximum number of rows to return (default: 10, max: 10000). Controls page size.'
      ),
    offset: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .default(0)
      .describe(
        'Number of rows to skip before returning data (default: 0). Use for pagination (e.g., offset=10, limit=10 returns rows 10-19).'
      ),
    tableId: z
      .string()
      .optional()
      .describe(
        'ID of the table to query (takes precedence over tableName if provided)'
      ),
    tableName: z
      .string()
      .optional()
      .describe('Name of the table to query (used if tableId is not provided)'),
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
    connectionUrl: z.string().optional().describe('Connection URL'),
    data: z
      .array(z.record(z.unknown()))
      .optional()
      .describe('Array of row objects with column values'),
    hasMore: z
      .boolean()
      .optional()
      .describe('Whether there are more rows available beyond this page'),
    limit: z.number().optional().describe('Limit used for this query'),
    offset: z.number().optional().describe('Offset used for this query'),
    rowCount: z.number().optional().describe('Number of rows returned'),
    tableId: z.string().optional().describe('ID of the table queried'),
    tableName: z.string().optional().describe('Name of the table'),
    totalRows: z.number().optional().describe('Total rows in table'),
  }),
} as const;

type Spec = typeof spec;
type HandlerArg = McpToolHandlerArg<Spec>;
type HandlerResult = McpToolHandlerResult<Spec>;
type GetTableDataTool = McpTool<Spec>;

export function createGetTableDataTool({
  serverManager,
}: {
  serverManager: IServerManager;
}): GetTableDataTool {
  return {
    name: 'getTableData',
    spec,
    handler: async ({
      connectionUrl: connectionUrlStr,
      limit = 10,
      offset = 0,
      tableId,
      tableName,
    }: HandlerArg): Promise<HandlerResult> => {
      const response = new McpToolResponse();

      try {
        const tableResult = await getTableOrError({
          connectionUrlStr,
          tableId,
          tableName,
          serverManager,
        });

        if (!tableResult.success) {
          const { details, error, errorMessage, hint } = tableResult;
          return response.errorWithHint(errorMessage, error, hint, details);
        }

        const { table, connectionUrl } = tableResult;

        try {
          const totalRows = table.size;

          // Validate offset
          if (offset >= totalRows) {
            return response.error('Offset exceeds table size', null, {
              connectionUrl: connectionUrl.toString(),
              limit,
              offset,
              tableName,
              totalRows,
            });
          }

          // Fetch paginated data
          const pageData = await getTablePage(table, offset, limit);

          const message = `Fetched ${pageData.rowCount} rows`;

          return response.success(message, {
            ...pageData,
            connectionUrl: connectionUrl.toString(),
            limit,
            offset,
            tableName,
          });
        } finally {
          table.close();
        }
      } catch (error) {
        return response.error('Failed to query table data', error, {
          connectionUrl: connectionUrlStr,
          limit,
          offset,
          tableName,
        });
      }
    },
  };
}
