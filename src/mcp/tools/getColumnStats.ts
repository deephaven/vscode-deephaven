import { z } from 'zod';
import type { dh as DhcType } from '@deephaven/jsapi-types';
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
import { convertColumnStatsToRecords } from '../utils/tableUtils';

const spec = {
  title: 'Get Column Statistics',
  description:
    'Get statistical information for a column in a Deephaven table. Returns statistics like min, max, average, and unique value counts. Useful for understanding data distribution and column characteristics.',
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
        'ID of the table containing the column (takes precedence over tableName if provided)'
      ),
    tableName: z
      .string()
      .optional()
      .describe(
        'Name of the table containing the column (used if tableId is not provided)'
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
    tableId: z.string().optional(),
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
  serverManager,
}: {
  serverManager: IServerManager;
}): GetColumnStatsTool {
  return {
    name: 'getColumnStats',
    spec,
    handler: async ({
      connectionUrl: connectionUrlStr,
      tableId,
      tableName,
      columnName,
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
          const column = table.findColumn(columnName);
          const columnStats: DhcType.ColumnStatistics =
            await table.getColumnStatistics(column);

          const { statistics, uniqueValues } =
            convertColumnStatsToRecords(columnStats);

          return response.success('Column stats retrieved', {
            statistics,
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
