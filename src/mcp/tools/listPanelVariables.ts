import * as vscode from 'vscode';
import { CONNECT_TO_SERVER_CMD } from '../../common/commands';
import { z } from 'zod';
import type {
  IPanelService,
  IServerManager,
  McpTool,
  McpToolHandlerResult,
} from '../../types';

const spec = {
  title: 'List Panel Variables',
  description: 'List all panel variables for a given Deephaven connection URL.',
  inputSchema: {
    url: z
      .string()
      .describe('The connection URL (e.g., "http://localhost:10000")'),
  },
  outputSchema: {
    success: z.boolean(),
    variables: z
      .array(z.object({ id: z.string(), title: z.string(), type: z.string() }))
      .optional(),
    message: z.string().optional(),
  },
} as const;

type Spec = typeof spec;
type HandlerResult = McpToolHandlerResult<Spec>;
type CreateListPanelVariablesTool = McpTool<Spec>;

export function createListPanelVariablesTool(
  panelService: IPanelService,
  serverManager: IServerManager
): CreateListPanelVariablesTool {
  return {
    name: 'listPanelVariables',
    spec,
    handler: async ({ url }: { url: string }): Promise<HandlerResult> => {
      try {
        const parsedUrl = new URL(url);
        const connections = serverManager.getConnections(parsedUrl);
        const hasConnection = connections.length > 0;
        if (!hasConnection) {
          const matchPort =
            parsedUrl.hostname === 'localhost' ||
            parsedUrl.hostname === '127.0.0.1';
          const server = serverManager.getServer(parsedUrl, matchPort);
          if (!server) {
            const output = {
              success: false,
              message: `Server not found: ${url}. Use listServers to see available servers.`,
            };
            return {
              content: [
                { type: 'text' as const, text: JSON.stringify(output) },
              ],
              structuredContent: output,
            };
          }
          if (server.type === 'DHC') {
            const serverState = { type: server.type, url: server.url };
            await vscode.commands.executeCommand(
              CONNECT_TO_SERVER_CMD,
              serverState
            );
          } else {
            const output = {
              success: false,
              message: `No active connection to ${url}. Use connectToServer first.`,
            };
            return {
              content: [
                { type: 'text' as const, text: JSON.stringify(output) },
              ],
              structuredContent: output,
            };
          }
        }
        const variables = [...panelService.getVariables(parsedUrl)].map(
          ({ id, title, type }) => ({ id, title, type })
        );
        const output = {
          success: true,
          variables,
          message: `Found ${variables.length} panel variable(s)`,
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output) }],
          structuredContent: output,
        };
      } catch (error) {
        const output = {
          success: false,
          message: `Failed to list panel variables: ${error instanceof Error ? error.message : String(error)}`,
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output) }],
          structuredContent: output,
        };
      }
    },
  };
}
