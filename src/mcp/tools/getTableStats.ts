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
    'Get schema information and basic statistics for a Deephaven table. Use tableName for persistent tables, or variableId for variables from runCode or listVariables. Returns column names, types, descriptions, row count, and other table metadata.',
  inputSchema: {
    connectionUrl: z
      .string()
      .describe(
        'Connection URL of the Deephaven server (e.g., "http://localhost:10000")'
      ),
    variableId: z
      .string()
      .optional()
      .describe(
        'Variable ID from runCode or listVariables (must be a Table). Takes precedence over tableName.'
      ),
    tableName: z
      .string()
      .optional()
      .describe(
        'Name of a persistent table (used if variableId is not provided)'
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
    variableId: z.string().optional().describe('Variable ID'),
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
      variableId,
      tableName,
    }: HandlerArg): Promise<HandlerResult> => {
      const response = new McpToolResponse();

      try {
        const tableResult = await getTableOrError({
          connectionUrlStr,
          variableId,
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
            variableId,
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
