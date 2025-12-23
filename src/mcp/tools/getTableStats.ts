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
  title: 'Get Table Schema and Statistics',
  description:
    'Get schema information and basic statistics for a Deephaven table. Returns column names, types, descriptions, row count, and other table metadata. Useful for understanding table structure and planning queries.',
  inputSchema: {
    connectionUrl: z
      .string()
      .describe(
        'Connection URL of the Deephaven server (e.g., "http://localhost:10000")'
      ),
    tableName: z.string().describe('Name of the table to describe'),
  },
  outputSchema: {
    success: z.boolean(),
    tableName: z.string().optional(),
    size: z.number().optional().describe('Number of rows in the table'),
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
    isRefreshing: z
      .boolean()
      .optional()
      .describe('Whether the table is refreshing (ticking)'),
    message: z.string().optional(),
    executionTimeMs: z
      .number()
      .optional()
      .describe('Execution time in milliseconds'),
  },
} as const;

type Spec = typeof spec;
type HandlerResult = McpToolHandlerResult<Spec>;
type GetTableStatsTool = McpTool<Spec>;

/**
 * Get table schema and basic statistics.
 */
export function createGetTableStatsTool(
  serverManager: IServerManager
): GetTableStatsTool {
  return {
    name: 'getTableStats',
    spec,
    handler: async ({
      connectionUrl,
      tableName,
    }: {
      connectionUrl: string;
      tableName: string;
    }): Promise<HandlerResult> => {
      const startTime = performance.now();
      try {
        // Parse and validate connection URL
        let serverUrl: URL;
        try {
          serverUrl = new URL(connectionUrl);
        } catch (e) {
          const output = {
            success: false,
            message: `Invalid connection URL: '${connectionUrl}'. Please provide a valid URL (e.g., 'http://localhost:10000').`,
            executionTimeMs: performance.now() - startTime,
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
          // Extract column information
          const columns = table.columns.map(col => ({
            name: col.name,
            type: col.type,
            ...(col.description && { description: col.description }),
          }));

          const output = {
            success: true,
            tableName,
            size: table.size,
            columns,
            isRefreshing: table.isRefreshing,
            message: `Table '${tableName}' has ${table.size} rows and ${columns.length} columns`,
            executionTimeMs: performance.now() - startTime,
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
              : 'Unknown error occurred while getting table statistics',
          executionTimeMs: performance.now() - startTime,
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      }
    },
  };
}
