import { z } from 'zod';
import type {
  McpTool,
  McpToolHandlerArg,
  McpToolHandlerResult,
  IServerManager,
} from '../../types';
import {
  createMcpToolOutputSchema,
  getTableOrError,
  McpToolResponse,
} from '../utils';
import { formatTableColumns } from '../utils/tableUtils';

const spec = {
  title: 'Get Table Schema and Statistics',
  description:
    'Get schema information and basic statistics for a Deephaven table. Returns column names, types, descriptions, row count, and other table metadata. Useful for understanding table structure and planning queries.',
  inputSchema: {
    connectionUrl: z
      .string()
      .describe(
        'Connection URL of the Deephaven server (e.g., "http://localhost:10000")'
      ),
    tableId: z
      .string()
      .optional()
      .describe(
        'ID of the table to describe (takes precedence over tableName if provided)'
      ),
    tableName: z
      .string()
      .optional()
      .describe(
        'Name of the table to describe (used if tableId is not provided)'
      ),
  },
  outputSchema: createMcpToolOutputSchema({
    columns: z
      .array(
        z.object({
          name: z.string(),
          type: z.string(),
          description: z.string().optional(),
        })
      )
      .optional()
      .describe('Array of column definitions'),
    connectionUrl: z.string().optional().describe('Connection URL'),
    isRefreshing: z
      .boolean()
      .optional()
      .describe('Whether the table is actively receiving real-time updates'),
    size: z.number().optional().describe('Number of rows in the table'),
    tableId: z.string().optional().describe('ID of the table'),
    tableName: z.string().optional().describe('Name of the table'),
  }),
} as const;

type Spec = typeof spec;
type HandlerArg = McpToolHandlerArg<Spec>;
type HandlerResult = McpToolHandlerResult<Spec>;
type GetTableStatsTool = McpTool<Spec>;

export function createGetTableStatsTool({
  serverManager,
}: {
  serverManager: IServerManager;
}): GetTableStatsTool {
  return {
    name: 'getTableStats',
    spec,
    handler: async ({
      connectionUrl: connectionUrlStr,
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

        const { table } = tableResult;

        try {
          const columns = formatTableColumns(table.columns);

          return response.success('Table stats retrieved', {
            columns,
            connectionUrl: connectionUrlStr,
            isRefreshing: table.isRefreshing,
            size: table.size,
            tableId,
            tableName,
          });
        } finally {
          table.close();
        }
      } catch (error) {
        return response.error('Failed to get table stats', error, {
          connectionUrl: connectionUrlStr,
          tableName,
        });
      }
    },
  };
}
