import * as vscode from 'vscode';
import { CONNECT_TO_SERVER_CMD } from '../../common/commands';
import { z } from 'zod';
import type { McpTool, McpToolHandlerResult } from '../../types';
import type { IServerManager } from '../../types';
import { DhcService } from '../../services';
import { isInstanceOf, parseUrl } from '../../util';
import {
  runCodeOutputSchema,
  extractVariables,
  McpToolResponse,
  createConnectionNotFoundHint,
} from '../utils';

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
      .describe('The Deephaven connection URL to use for execution.'),
  },
  outputSchema: runCodeOutputSchema,
} as const;

type Spec = typeof spec;
type HandlerResult = McpToolHandlerResult<Spec>;
type RunCodeTool = McpTool<Spec>;

export function createRunCodeTool({
  serverManager,
}: {
  serverManager: IServerManager;
}): RunCodeTool {
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
      connectionUrl: string;
    }): Promise<HandlerResult> => {
      const response = new McpToolResponse();

      // Validate languageId
      if (languageId !== 'python' && languageId !== 'groovy') {
        return response.error(
          `Invalid languageId: '${languageId}'. Must be "python" or "groovy".`
        );
      }

      const parsedConnectionURL = parseUrl(connectionUrl);
      if (!parsedConnectionURL.success) {
        return response.error('Invalid URL', parsedConnectionURL.error, {
          connectionUrl,
        });
      }

      try {
        let connections = serverManager.getConnections(
          parsedConnectionURL.value
        );

        if (connections.length === 0) {
          // If we don't already have a connection, see if there is a running
          // server matching the connection URL
          const server = serverManager.getServer(parsedConnectionURL.value);

          if (server == null) {
            const hint = await createConnectionNotFoundHint(
              serverManager,
              connectionUrl,
              languageId
            );

            return response.errorWithHint(
              'No connections or server found',
              null,
              hint,
              {
                connectionUrl,
              }
            );
          }

          if (!server.isRunning) {
            return response.error('Server is not running', null, {
              connectionUrl,
            });
          }

          const serverState = { type: server.type, url: server.url };

          await vscode.commands.executeCommand(
            CONNECT_TO_SERVER_CMD,
            serverState
          );

          connections = serverManager.getConnections(parsedConnectionURL.value);

          if (connections.length === 0) {
            return response.error('Failed to connect to server', null, {
              connectionUrl,
            });
          }
        }

        const [connection] = connections;

        // There shouldn't really be a case where the connection is not a
        // DhcService, but this is consistent with how we check connections
        // elsewhere
        if (!isInstanceOf(connection, DhcService)) {
          return response.error(
            'Code execution is only supported for DHC connections.',
            null,
            { connectionUrl }
          );
        }

        // Execute the code
        const result = await connection.runCode(code, languageId);

        // Extract variables from result (even if there was an error)
        const variables = extractVariables(result);

        if (result?.error) {
          return response.error('Code execution failed', result.error, {
            languageId,
            variables,
          });
        }

        return response.success('Code executed successfully', {
          variables,
        });
      } catch (error) {
        return response.error('Failed to execute code', error, {
          languageId,
        });
      }
    },
  };
}
