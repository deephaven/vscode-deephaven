import { z } from 'zod';
import type {
  IServerManager,
  McpTool,
  McpToolHandlerArg,
  McpToolHandlerResult,
  WorkerURL,
} from '../../types';
import { createMcpToolOutputSchema, McpToolResponse } from '../utils';
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
  outputSchema: createMcpToolOutputSchema({
    connections: z.array(
      z.object({
        serverUrl: z.string(),
        isConnected: z.boolean(),
        isRunningCode: z.boolean().optional(),
        querySerial: z.string().optional(),
        tagId: z.string().optional(),
      })
    ),
  }),
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
        return response.error('Invalid URL', parsedURLResult.error, {
          serverUrl,
        });
      }

      try {
        const rawConnections = serverManager.getConnections(
          parsedURLResult.value ?? undefined
        );

        const connections = await Promise.all(
          rawConnections.map(
            async ({ serverUrl, isConnected, isRunningCode, tagId }) => {
              // Get worker info to retrieve querySerial for DHE connections
              const workerInfo = await serverManager.getWorkerInfo(
                serverUrl as WorkerURL
              );

              return {
                serverUrl: serverUrl.toString(),
                isConnected,
                isRunningCode,
                tagId,
                querySerial: workerInfo?.serial,
              };
            }
          )
        );

        return response.success(`Found ${connections.length} connection(s)`, {
          connections,
        });
      } catch (error) {
        return response.error('Failed to list connections', error);
      }
    },
  };
}
