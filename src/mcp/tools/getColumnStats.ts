import { z } from 'zod';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import type {
  McpTool,
  McpToolHandlerArg,
  McpToolHandlerResult,
  IServerManager,
  IAsyncCacheService,
} from '../../types';
import {
  createMcpToolOutputSchema,
  getTableOrError,
  McpToolResponse,
} from '../utils';
import { convertColumnStatsToRecords } from '../utils/tableUtils';

const spec = {
  title: 'Get Column Statistics',
  description:
    'Get statistical information for a column in a Deephaven table. Prefer variableId if available (from runCode or listVariables, must have type "Table"); use tableName when the user specifies a table by name and you have no variableId. Returns statistics like min, max, average, and unique value counts.',
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
        'Variable ID from runCode or listVariables. Must have type "Table"; takes precedence over tableName.'
      ),
    tableName: z
      .string()
      .optional()
      .describe(
        'Table name specified by the user. Only use when variableId is not available.'
      ),
    columnName: z.string().describe('Name of the column to get statistics for'),
  },
  outputSchema: createMcpToolOutputSchema({
    columnName: z.string().optional(),
    connectionUrl: z.string().optional(),
    statistics: z
      .record(z.unknown())
      .optional()
      .describe(
        'Map of statistic names to their values (e.g., MIN, MAX, AVG, SUM, etc.)'
      ),
    variableId: z.string().optional().describe('Variable ID'),
    tableName: z.string().optional(),
    uniqueValues: z
      .record(z.number())
      .optional()
      .describe(
        'Map of unique values to their counts (only included for low-cardinality columns)'
      ),
  }),
} as const;

type Spec = typeof spec;
type HandlerArg = McpToolHandlerArg<Spec>;
type HandlerResult = McpToolHandlerResult<Spec>;
type GetColumnStatsTool = McpTool<Spec>;

export function createGetColumnStatsTool({
  coreJsApiCache,
  serverManager,
}: {
  coreJsApiCache: IAsyncCacheService<URL, typeof DhcType>;
  serverManager: IServerManager;
}): GetColumnStatsTool {
  return {
    name: 'getColumnStats',
    spec,
    handler: async ({
      connectionUrl: connectionUrlStr,
      variableId,
      tableName,
      columnName,
    }: HandlerArg): Promise<HandlerResult> => {
      const response = new McpToolResponse();

      try {
        const tableResult = await getTableOrError({
          coreJsApiCache,
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
          const column = table.findColumn(columnName);
          const columnStats: DhcType.ColumnStatistics =
            await table.getColumnStatistics(column);

          const { statistics, uniqueValues } =
            convertColumnStatsToRecords(columnStats);

          return response.success('Column stats retrieved', {
            columnName,
            connectionUrl: connectionUrlStr,
            statistics,
            variableId,
            tableName,
            ...(Object.keys(uniqueValues).length > 0 && { uniqueValues }),
          });
        } finally {
          table.close();
        }
      } catch (error) {
        return response.error('Failed to get column stats', error, {
          connectionUrl: connectionUrlStr,
          tableName,
          columnName,
        });
      }
    },
  };
}
