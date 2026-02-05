import { z } from 'zod';
import {
  execConnectToServer,
  execOpenVariablePanels,
} from '../../common/commands';
import type {
  IServerManager,
  McpTool,
  McpToolHandlerArg,
  McpToolHandlerResult,
  NonEmptyArray,
  VariableDefintion,
} from '../../types';
import { parseUrl } from '../../util';
import { createMcpToolOutputSchema, McpToolResponse } from '../utils';

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
        })
      )
      .describe('List of variable definitions to open panels for.'),
  },
  outputSchema: createMcpToolOutputSchema(),
} as const;

type Spec = typeof spec;
type HandlerArg = McpToolHandlerArg<Spec>;
type HandlerResult = McpToolHandlerResult<Spec>;
type OpenVariablePanelsTool = McpTool<Spec>;

export function createOpenVariablePanelsTool({
  serverManager,
}: {
  serverManager: IServerManager;
}): OpenVariablePanelsTool {
  return {
    name: 'openVariablePanels',
    spec,
    handler: async ({
      connectionUrl,
      variables,
    }: HandlerArg): Promise<HandlerResult> => {
      const response = new McpToolResponse();

      const parsedUrl = parseUrl(connectionUrl);
      if (!parsedUrl.success) {
        return response.error('Invalid URL', parsedUrl.error, {
          connectionUrl,
        });
      }

      if (variables.length === 0) {
        return response.error('No variables provided', null, {
          connectionUrl,
        });
      }

      try {
        let connections = serverManager.getConnections(parsedUrl.value);

        if (!connections.length) {
          const server = serverManager.getServer(parsedUrl.value);

          if (!server) {
            return response.errorWithHint(
              'Server not found',
              null,
              'Use listServers to see available servers',
              { connectionUrl }
            );
          }

          if (server.type === 'DHC') {
            const serverState = { type: server.type, url: server.url };
            await execConnectToServer(serverState);

            connections = serverManager.getConnections(parsedUrl.value);

            if (!connections.length) {
              return response.error('Failed to connect to server', null, {
                connectionUrl,
              });
            }
          } else {
            return response.errorWithHint(
              'No active connection',
              null,
              'Use connectToServer first',
              { connectionUrl }
            );
          }
        }

        await execOpenVariablePanels(
          parsedUrl.value,
          variables as unknown as NonEmptyArray<VariableDefintion>
        );

        return response.success('Variable panels opened successfully');
      } catch (error) {
        return response.error('Failed to open variable panels', error);
      }
    },
  };
}
