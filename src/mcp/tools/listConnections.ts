import { z } from 'zod';
import type {
  IServerManager,
  McpTool,
  McpToolHandlerResult,
} from '../../types';

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
  },
} as const;

type Spec = typeof spec;
type HandlerResult = McpToolHandlerResult<Spec>;
type ListConnectionsTool = McpTool<Spec>;

export function createListConnectionsTool(
  serverManager: IServerManager | null
): ListConnectionsTool {
  return {
    name: 'listConnections',
    spec,
    handler: async ({
      serverUrl,
    }: {
      serverUrl?: string;
    }): Promise<HandlerResult> => {
      try {
        if (!serverManager) {
          const output = {
            success: false,
            message: 'Server manager not available',
          };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(output) }],
            structuredContent: output,
          };
        }
        const parsedUrl = serverUrl ? new URL(serverUrl) : undefined;
        const rawConnections = serverManager.getConnections(parsedUrl);
        const connections = rawConnections.map(connection => ({
          serverUrl: connection.serverUrl.toString(),
          isConnected: connection.isConnected,
          isRunningCode: connection.isRunningCode,
          tagId: connection.tagId,
        }));
        const output = {
          success: true,
          connections,
          message: `Found ${connections.length} connection(s)`,
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output) }],
          structuredContent: output,
        };
      } catch (error) {
        const output = {
          success: false,
          message: `Failed to list connections: ${error instanceof Error ? error.message : String(error)}`,
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output) }],
          structuredContent: output,
        };
      }
    },
  };
}
