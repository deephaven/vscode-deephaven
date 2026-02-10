import { z } from 'zod';
import { execOpenVariablePanels } from '../../common/commands';
import type {
  IServerManager,
  McpTool,
  McpToolHandlerArg,
  McpToolHandlerResult,
  NonEmptyArray,
  VariableDefintion,
} from '../../types';
import { parseUrl } from '../../util';
import {
  createMcpToolOutputSchema,
  getFirstConnectionOrCreate,
  McpToolResponse,
} from '../utils';

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
  outputSchema: createMcpToolOutputSchema({
    connectionUrl: z.string().optional(),
  }),
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

      const firstConnectionResult = await getFirstConnectionOrCreate({
        serverManager,
        connectionUrl: parsedUrl.value,
      });

      if (!firstConnectionResult.success) {
        return response.errorWithHint(
          firstConnectionResult.errorMessage,
          firstConnectionResult.error,
          firstConnectionResult.hint,
          firstConnectionResult.details
        );
      }

      try {
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
