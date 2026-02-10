import { z } from 'zod';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import type {
  McpTool,
  McpToolHandlerArg,
  McpToolHandlerResult,
  IServerManager,
} from '../../types';
import { parseUrl } from '../../util';
import {
  createMcpToolOutputSchema,
  getFirstConnectionOrCreate,
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
    tableName: z.string().describe('Name of the table containing the column'),
    columnName: z.string().describe('Name of the column to get statistics for'),
  },
  outputSchema: createMcpToolOutputSchema({
    availableColumns: z.array(z.string()).optional(),
    columnName: z.string().optional(),
    connectionUrl: z.string().optional(),
    statistics: z
      .record(z.unknown())
      .optional()
      .describe(
        'Map of statistic names to their values (e.g., MIN, MAX, AVG, SUM, etc.)'
      ),
    tableName: z.string().optional(),
    uniqueValues: z
      .record(z.number())
      .optional()
      .describe(
        'Map of unique values to their counts (only for columns with 19 or fewer unique values)'
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
      connectionUrl,
      tableName,
      columnName,
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

        if (session == null) {
          return response.error('Unable to access session', null, {
            connectionUrl,
          });
        }

        const table: DhcType.Table = await session.getObject({
          type: 'Table',
          name: tableName,
        });

        try {
          const column = table.findColumn(columnName);

          if (!column) {
            return response.error('Column not found', null, {
              columnName,
              tableName,
              availableColumns: table.columns.map(c => c.name),
            });
          }

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
          connectionUrl,
          tableName,
          columnName,
        });
      }
    },
  };
}
