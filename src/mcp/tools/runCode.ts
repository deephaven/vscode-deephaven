import * as vscode from 'vscode';
import { CONNECT_TO_SERVER_CMD } from '../../common/commands';
import { z } from 'zod';
import type { McpTool, McpToolHandlerResult } from '../../types';
import type { IServerManager } from '../../types';
import { DhcService } from '../../services';
import { isInstanceOf } from '../../util';
import {
  runCodeOutputSchema,
  createResult,
  extractVariables,
} from './runCodeUtils';

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
  outputSchema: runCodeOutputSchema,
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
      const startTime = performance.now();
      try {
        // Validate languageId
        if (languageId !== 'python' && languageId !== 'groovy') {
          return createResult(
            false,
            [],
            `Invalid languageId: '${languageId}'. Must be "python" or "groovy".`,
            performance.now() - startTime
          );
        }

        // If connectionUrl is provided, ensure connection exists
        if (connectionUrl) {
          let parsedUrl: URL;
          try {
            parsedUrl = new URL(connectionUrl);
          } catch (e) {
            return createResult(
              false,
              [],
              `Invalid connectionUrl: '${connectionUrl}'. Please provide a valid Deephaven server URL (e.g., 'http://localhost:10000'). If this was a server label, use listServers to find the corresponding URL.`,
              performance.now() - startTime
            );
          }
          let connections = serverManager.getConnections(parsedUrl);
          if (!connections.length) {
            // Try to connect (DHC only, for DHE user must use connectToServer first)
            const server = serverManager.getServer(parsedUrl);
            if (!server) {
              return createResult(
                false,
                [],
                `Server not found: ${connectionUrl}`,
                performance.now() - startTime
              );
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
                return createResult(
                  false,
                  [],
                  `Failed to connect to server: ${connectionUrl}`,
                  performance.now() - startTime
                );
              }
            } else {
              return createResult(
                false,
                [],
                `No active connection to ${connectionUrl}. Use connectToServer first.`,
                performance.now() - startTime
              );
            }
          }

          const connection = connections[0];

          // Verify it's a DHC connection
          if (!isInstanceOf(connection, DhcService)) {
            return createResult(
              false,
              [],
              'Code execution is only supported for DHC connections.',
              performance.now() - startTime
            );
          }

          // Execute the code
          const result = await connection.runCode(code, languageId);

          // Extract variables from result (even if there was an error)
          const variables = extractVariables(result);

          // Check for errors in the result
          if (result != null && result.error) {
            return createResult(
              false,
              variables,
              `Code execution failed:\n${result.error}`,
              performance.now() - startTime
            );
          }

          return createResult(true, variables, undefined, performance.now() - startTime);
        } else {
          // No connectionUrl provided - need to get a default connection
          return createResult(
            false,
            [],
            'connectionUrl is required. Use listConnections to find available connections.',
            performance.now() - startTime
          );
        }
      } catch (error) {
        return createResult(
          false,
          [],
          `Failed to execute code: ${error instanceof Error ? error.message : String(error)}`,
          performance.now() - startTime
        );
      }
    },
  };
}
