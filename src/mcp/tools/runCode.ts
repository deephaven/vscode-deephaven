import * as vscode from 'vscode';
import { CONNECT_TO_SERVER_CMD } from '../../common/commands';
import { z } from 'zod';
import type { McpTool, McpToolHandlerResult } from '../../types';
import type { IServerManager } from '../../types';
import { DhcService } from '../../services';
import { isInstanceOf } from '../../util';

const spec = {
  title: 'Run Deephaven Code',
  description:
    'Execute arbitrary code text in a Deephaven session. Use this for ad-hoc script execution. For running code from workspace files, use runCodeFromUri instead.',
  inputSchema: {
    code: z.string().describe('The code text to execute.'),
    languageId: z
      .string()
      .describe('The language ID for the code. Must be "python" or "groovy".'),
    connectionUrl: z
      .string()
      .optional()
      .describe('The Deephaven connection URL to use for execution.'),
  },
  outputSchema: {
    success: z.boolean(),
    message: z.string(),
  },
} as const;

type Spec = typeof spec;
type HandlerResult = McpToolHandlerResult<Spec>;
type RunCodeTool = McpTool<Spec>;

export function createRunCodeTool(serverManager: IServerManager): RunCodeTool {
  return {
    name: 'runCode',
    spec,
    handler: async ({
      code,
      languageId,
      connectionUrl,
    }: {
      code: string;
      languageId: string;
      connectionUrl?: string;
    }): Promise<HandlerResult> => {
      try {
        // Validate languageId
        if (languageId !== 'python' && languageId !== 'groovy') {
          const output = {
            success: false,
            message: `Invalid languageId: '${languageId}'. Must be "python" or "groovy".`,
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(output) }],
            structuredContent: output,
          };
        }

        // If connectionUrl is provided, ensure connection exists
        if (connectionUrl) {
          let parsedUrl: URL;
          try {
            parsedUrl = new URL(connectionUrl);
          } catch (e) {
            const output = {
              success: false,
              message: `Invalid connectionUrl: '${connectionUrl}'. Please provide a valid Deephaven server URL (e.g., 'http://localhost:10000'). If this was a server label, use listServers to find the corresponding URL.`,
            };
            return {
              content: [{ type: 'text', text: JSON.stringify(output) }],
              structuredContent: output,
            };
          }
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

          const connection = connections[0];

          // Verify it's a DHC connection
          if (!isInstanceOf(connection, DhcService)) {
            const output = {
              success: false,
              message: 'Code execution is only supported for DHC connections.',
            };
            return {
              content: [{ type: 'text', text: JSON.stringify(output) }],
              structuredContent: output,
            };
          }

          // Execute the code
          const result = await connection.runCode(code, languageId);

          // Check for errors in the result
          if (result != null && result.error) {
            const output = {
              success: false,
              message: `Code execution failed:\n${result.error}`,
            };
            return {
              content: [{ type: 'text', text: JSON.stringify(output) }],
              structuredContent: output,
            };
          }
        } else {
          // No connectionUrl provided - need to get a default connection
          const output = {
            success: false,
            message:
              'connectionUrl is required. Use listConnections to find available connections.',
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(output) }],
            structuredContent: output,
          };
        }

        const output = { success: true, message: 'Code executed successfully' };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output) }],
          structuredContent: output,
        };
      } catch (error) {
        const output = {
          success: false,
          message: `Failed to execute code: ${error instanceof Error ? error.message : String(error)}`,
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output) }],
          structuredContent: output,
        };
      }
    },
  };
}
