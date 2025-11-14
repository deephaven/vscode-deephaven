import * as vscode from 'vscode';
import { CONNECT_TO_SERVER_CMD, OPEN_VARIABLE_PANELS_CMD } from '../../common';
import { z } from 'zod';
import type {
  McpTool,
  McpToolHandlerResult,
  IServerManager,
} from '../../types';

const spec = {
  title: 'Open Variable Panels',
  description:
    'Open variable panels for a given connection URL and list of variables.',
  inputSchema: {
    connectionUrl: z.string().describe('The Deephaven connection URL.'),

    variables: z
      .array(
        z.object({
          id: z.string(),
          title: z.string(),
          type: z.string(),
        })
      )
      .describe('List of variable definitions to open panels for.'),
  },
  outputSchema: {
    success: z.boolean(),
    message: z.string(),
  },
} as const;

type Spec = typeof spec;
type OpenVariablePanelsTool = McpTool<Spec>;

export function createOpenVariablePanelsTool(
  serverManager: IServerManager | null
): OpenVariablePanelsTool {
  return {
    name: 'openVariablePanels',
    spec,
    handler: async ({
      connectionUrl,
      variables,
    }: {
      connectionUrl: string;
      variables: { id: string; title: string; type: string }[];
    }): Promise<McpToolHandlerResult<Spec>> => {
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
        const parsedUrl = new URL(connectionUrl);
        let connections = serverManager.getConnections(parsedUrl);
        if (!connections.length) {
          // Try to connect (DHC only, for DHE user must use connectToServer first)
          const server = serverManager.getServer(parsedUrl);
          if (!server) {
            const output = {
              success: false,
              message: `Server not found: ${connectionUrl}`,
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
            // Wait for connection to be established (could poll or just re-fetch)
            connections = serverManager.getConnections(parsedUrl);
            if (!connections.length) {
              const output = {
                success: false,
                message: `Failed to connect to server: ${connectionUrl}`,
              };
              return {
                content: [
                  { type: 'text' as const, text: JSON.stringify(output) },
                ],
                structuredContent: output,
              };
            }
          } else {
            const output = {
              success: false,
              message: `No active connection to ${connectionUrl}. Use connectToServer first.`,
            };
            return {
              content: [
                { type: 'text' as const, text: JSON.stringify(output) },
              ],
              structuredContent: output,
            };
          }
        }
        await vscode.commands.executeCommand(
          OPEN_VARIABLE_PANELS_CMD,
          parsedUrl,
          variables
        );
        const output = {
          success: true,
          message: 'Variable panels opened successfully',
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output) }],
          structuredContent: output,
        };
      } catch (error) {
        const output = {
          success: false,
          message: `Failed to open variable panels: ${error instanceof Error ? error.message : String(error)}`,
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output) }],
          structuredContent: output,
        };
      }
    },
  };
}
