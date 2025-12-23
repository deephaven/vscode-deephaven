import * as vscode from 'vscode';
import { CONNECT_TO_SERVER_CMD } from '../../common/commands';
import { z } from 'zod';
import type {
  IServerManager,
  McpTool,
  McpToolHandlerResult,
} from '../../types';

const spec = {
  title: 'Connect to Server',
  description:
    'Create a connection to a Deephaven server. The server must already be configured in the extension. For DHE (Enterprise) servers, this will create a new worker.',
  inputSchema: {
    url: z.string().describe('Server URL (e.g., "http://localhost:10000")'),
  },
  outputSchema: {
    success: z.boolean(),
    message: z.string(),
    executionTimeMs: z
      .number()
      .optional()
      .describe('Execution time in milliseconds'),
  },
} as const;

type Spec = typeof spec;
type HandlerResult = McpToolHandlerResult<Spec>;
type ConnectToServerTool = McpTool<Spec>;

export function createConnectToServerTool(
  serverManager: IServerManager
): ConnectToServerTool {
  return {
    name: 'connectToServer',
    spec,
    handler: async ({ url }: { url: string }): Promise<HandlerResult> => {
      const startTime = performance.now();
      try {
        let serverUrl: URL;
        try {
          serverUrl = new URL(url);
        } catch (e) {
          const output = {
            success: false,
            message: `Invalid server URL: '${url}'. Please provide a valid URL (e.g., 'http://localhost:10000'). If this was a server label, you can check the list of configured servers to find the corresponding URL.`,
            executionTimeMs: performance.now() - startTime,
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(output) }],
            structuredContent: output,
          };
        }
        const server = serverManager.getServer(serverUrl);
        if (!server) {
          const output = {
            success: false,
            message: `Server not found: ${url}. Use listServers to see available servers.`,
            executionTimeMs: performance.now() - startTime,
          };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(output) }],
            structuredContent: output,
          };
        }
        const serverState = { type: server.type, url: serverUrl };
        await vscode.commands.executeCommand(
          CONNECT_TO_SERVER_CMD,
          serverState
        );
        const output = {
          success: true,
          message: `Connecting to ${server.type} server at ${url}`,
          executionTimeMs: performance.now() - startTime,
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output) }],
          structuredContent: output,
        };
      } catch (error) {
        const output = {
          success: false,
          message: `Failed to connect to server: ${error instanceof Error ? error.message : String(error)}`,
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
