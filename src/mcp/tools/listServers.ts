import { z } from 'zod';
import type {
  IServerManager,
  McpTool,
  McpToolHandlerResult,
} from '../../types';

const spec = {
  title: 'List Servers',
  description:
    'List all Deephaven servers with optional filtering by running status, connection status, or type.',
  inputSchema: {
    isRunning: z
      .boolean()
      .optional()
      .describe('Filter by running status (true = running, false = stopped)'),
    hasConnections: z
      .boolean()
      .optional()
      .describe(
        'Filter by connection status (true = has connections, false = no connections)'
      ),
    type: z
      .enum(['DHC', 'DHE'])
      .optional()
      .describe('Filter by server type (DHC = Community, DHE = Enterprise)'),
  },
  outputSchema: {
    success: z.boolean(),
    servers: z
      .array(
        z.object({
          type: z.string(),
          url: z.string(),
          label: z.string().optional(),
          isConnected: z.boolean(),
          isRunning: z.boolean(),
          connectionCount: z.number(),
          isManaged: z.boolean().optional(),
          tags: z.array(z.string()).optional(),
          connections: z
            .array(
              z.object({
                isConnected: z.boolean(),
                isRunningCode: z.boolean().optional(),
                serverUrl: z.string(),
                tagId: z.string().optional(),
              })
            )
            .optional(),
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
type HandlerResult = McpToolHandlerResult<Spec>;
type CreateListServersTool = McpTool<Spec>;

export function createListServersTool(
  serverManager: IServerManager
): CreateListServersTool {
  return {
    name: 'listServers',
    spec,
    handler: async ({
      isRunning,
      hasConnections,
      type,
    }: {
      isRunning?: boolean;
      hasConnections?: boolean;
      type?: 'DHC' | 'DHE';
    }): Promise<HandlerResult> => {
      const startTime = performance.now();
      try {
        const servers = serverManager
          .getServers({ isRunning, hasConnections, type })
          .map(server => {
            const connections = serverManager
              .getConnections(server.url)
              .map(conn => ({
                isConnected: conn.isConnected,
                isRunningCode: conn.isRunningCode,
                serverUrl: conn.serverUrl.toString(),
                tagId: conn.tagId ? String(conn.tagId) : undefined,
              }));
            return {
              type: server.type,
              url: server.url.toString(),
              label: server.label,
              isConnected: server.isConnected,
              isRunning: server.isRunning,
              connectionCount: server.connectionCount,
              isManaged: server.isManaged,
              tags: server.isManaged ? ['pip', 'managed'] : [],
              connections,
            };
          });
        const output = {
          success: true,
          servers,
          message: `Found ${servers.length} server(s)`,
          executionTimeMs: performance.now() - startTime,
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output) }],
          structuredContent: output,
        };
      } catch (error) {
        const output = {
          success: false,
          message: `Failed to list servers: ${error instanceof Error ? error.message : String(error)}`,
          executionTimeMs: performance.now() - startTime,
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output) }],
          structuredContent: output,
        };
      }
    },
  };
}
