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
    tableName: z.string().describe('Name of the table to describe'),
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
      connectionUrl,
      tableName,
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
          const columns = formatTableColumns(table.columns);

          return response.success('Table stats retrieved', {
            tableName,
            size: table.size,
            columns,
            isRefreshing: table.isRefreshing,
          });
        } finally {
          table.close();
        }
      } catch (error) {
        return response.error('Failed to get table stats', error, {
          connectionUrl,
          tableName,
        });
      }
    },
  };
}
