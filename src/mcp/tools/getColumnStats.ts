import { z } from 'zod';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import type {
  McpTool,
  McpToolHandlerResult,
  IServerManager,
} from '../../types';
import { DhcService } from '../../services';
import { isInstanceOf } from '../../util';

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
  outputSchema: {
    success: z.boolean(),
    statistics: z
      .record(z.unknown())
      .optional()
      .describe(
        'Map of statistic names to their values (e.g., MIN, MAX, AVG, SUM, etc.)'
      ),
    uniqueValues: z
      .record(z.number())
      .optional()
      .describe(
        'Map of unique values to their counts (only for columns with 19 or fewer unique values)'
      ),
    message: z.string().optional(),
  },
} as const;

type Spec = typeof spec;
type HandlerResult = McpToolHandlerResult<Spec>;
type GetColumnStatsTool = McpTool<Spec>;

/**
 * Get column statistics using JS API.
 */
export function createGetColumnStatsTool(
  serverManager: IServerManager
): GetColumnStatsTool {
  return {
    name: 'getColumnStats',
    spec,
    handler: async ({
      connectionUrl,
      tableName,
      columnName,
    }: {
      connectionUrl: string;
      tableName: string;
      columnName: string;
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

        // Get the table by name
        const table: DhcType.Table = await session.getObject({
          type: 'Table',
          name: tableName,
        });

        try {
          // Find the column
          const column = table.findColumn(columnName);

          if (!column) {
            const output = {
              success: false,
              message: `Column '${columnName}' not found in table '${tableName}'. Available columns: ${table.columns.map(c => c.name).join(', ')}`,
            };
            return {
              content: [
                { type: 'text', text: JSON.stringify(output, null, 2) },
              ],
              structuredContent: output,
            };
          }

          // Get column statistics
          const columnStats: DhcType.ColumnStatistics =
            await table.getColumnStatistics(column);

          // Convert statisticsMap to plain object
          const statistics: Record<string, unknown> = {};
          columnStats.statisticsMap.forEach((value, key) => {
            statistics[key] = value;
          });

          // Convert uniqueValues Map to plain object
          const uniqueValues: Record<string, number> = {};
          columnStats.uniqueValues.forEach((count, value) => {
            uniqueValues[value] = count;
          });

          const output = {
            success: true,
            statistics,
            uniqueValues:
              Object.keys(uniqueValues).length > 0 ? uniqueValues : undefined,
            message: `Retrieved statistics for column '${columnName}' in table '${tableName}'`,
          };

          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output,
          };
        } finally {
          table.close();
        }
      } catch (error) {
        const output = {
          success: false,
          message:
            error instanceof Error
              ? error.message
              : 'Unknown error occurred while getting column statistics',
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      }
    },
  };
}
