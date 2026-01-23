import { z } from 'zod';
import { execConnectToServer } from '../../common/commands';
import type {
  IServerManager,
  McpTool,
  McpToolHandlerArg,
  McpToolHandlerResult,
} from '../../types';
import { parseUrl } from '../../util';
import { McpToolResponse } from '../utils';

const spec = {
  title: 'Connect to Server',
  description:
    'Create a connection to a Deephaven server. The server must already be configured in the extension. For DHE (Enterprise) servers, this will create a new worker.',
  inputSchema: {
    url: z.string().describe('Server URL (e.g., "http://localhost:10000")'),
  },
  outputSchema: {
    success: z.boolean(),
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
type ConnectToServerTool = McpTool<Spec>;

export function createConnectToServerTool(
  serverManager: IServerManager
): ConnectToServerTool {
  return {
    name: 'connectToServer',
    spec,
    handler: async ({ url }: HandlerArg): Promise<HandlerResult> => {
      const response = new McpToolResponse();

      const parsedUrlResult = parseUrl(url);
      if (!parsedUrlResult.success) {
        return response.errorWithHint(
          'Invalid server URL',
          parsedUrlResult.error,
          `Please provide a valid URL (e.g., 'http://localhost:10000'). If this was a server label, use listServers to find the corresponding URL.`,
          { url }
        );
      }

      const serverUrl = parsedUrlResult.value;
      const server = serverManager.getServer(serverUrl);
      if (!server) {
        return response.errorWithHint(
          'Server not found',
          undefined,
          'Use listServers to see available servers.',
          { url }
        );
      }

      try {
        await execConnectToServer({ type: server.type, url: serverUrl });
        return response.success('Connecting to server', {
          type: server.type,
          url,
        });
      } catch (error) {
        return response.error('Failed to connect to server', error);
      }
    },
  };
}
