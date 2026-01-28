import { z } from 'zod';
import type {
  IServerManager,
  McpTool,
  McpToolHandlerArg,
  McpToolHandlerResult,
} from '../../types';
import { createMcpToolOutputSchema, McpToolResponse } from '../utils';
import { serverToResult, serverResultSchema } from '../utils/serverUtils';

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
  outputSchema: createMcpToolOutputSchema({
    servers: z.array(serverResultSchema),
  }),
} as const;

type Spec = typeof spec;
type HandlerArg = McpToolHandlerArg<Spec>;
type HandlerResult = McpToolHandlerResult<Spec>;
type CreateListServersTool = McpTool<Spec>;

export function createListServersTool({
  serverManager,
}: {
  serverManager: IServerManager;
}): CreateListServersTool {
  return {
    name: 'listServers',
    spec,
    handler: async ({
      isRunning,
      hasConnections,
      type,
    }: HandlerArg): Promise<HandlerResult> => {
      const response = new McpToolResponse();

      try {
        const servers = serverManager
          .getServers({ isRunning, hasConnections, type })
          .map(server => {
            const connections = serverManager.getConnections(server.url);
            return serverToResult(server, connections);
          });

        return response.success(`Found ${servers.length} server(s)`, {
          servers,
        });
      } catch (error) {
        return response.error('Failed to list servers', error);
      }
    },
  };
}
