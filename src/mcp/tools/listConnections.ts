import { z } from 'zod';
import type {
  IServerManager,
  McpTool,
  McpToolHandlerArg,
  McpToolHandlerResult,
} from '../../types';
import { McpToolResponse } from '../utils';
import { parseUrl } from '../../util';

const spec = {
  title: 'List Connections',
  description:
    'List all active Deephaven connections, optionally filtered by server URL.',
  inputSchema: {
    serverUrl: z
      .string()
      .optional()
      .describe(
        'Optional server URL to filter connections (e.g., "http://localhost:10000")'
      ),
  },
  outputSchema: {
    success: z.boolean(),
    connections: z
      .array(
        z.object({
          serverUrl: z.string(),
          isConnected: z.boolean(),
          isRunningCode: z.boolean().optional(),
          tagId: z.string().optional(),
        })
      )
      .optional(),
    message: z.string().optional(),
    executionTimeMs: z
      .number()
      .optional()
      .describe('Execution time in milliseconds'),
  },
} as const;

type Spec = typeof spec;
type HandlerArg = McpToolHandlerArg<Spec>;
type HandlerResult = McpToolHandlerResult<Spec>;
type ListConnectionsTool = McpTool<Spec>;

export function createListConnectionsTool({
  serverManager,
}: {
  serverManager: IServerManager;
}): ListConnectionsTool {
  return {
    name: 'listConnections',
    spec,
    handler: async ({ serverUrl }: HandlerArg): Promise<HandlerResult> => {
      const response = new McpToolResponse();

      const parsedURLResult = parseUrl(serverUrl);
      if (!parsedURLResult.success) {
        return response.error('Invalid serverUrl', parsedURLResult.error, {
          serverUrl,
        });
      }

      try {
        const parsedUrl = serverUrl ? new URL(serverUrl) : undefined;
        const rawConnections = serverManager.getConnections(parsedUrl);
        const connections = rawConnections.map(connection => ({
          serverUrl: connection.serverUrl.toString(),
          isConnected: connection.isConnected,
          isRunningCode: connection.isRunningCode,
          tagId: connection.tagId,
        }));

        return response.success(`Found ${connections.length} connection(s)`, {
          connections,
        });
      } catch (error) {
        return response.error('Failed to list connections', error);
      }
    },
  };
}
