import { z } from 'zod';
import type {
  IPanelService,
  IServerManager,
  McpTool,
  McpToolHandlerArg,
  McpToolHandlerResult,
} from '../../types';
import { parseUrl } from '../../util';
import { McpToolResponse, getFirstConnectionOrCreate } from '../utils';

const spec = {
  title: 'List Panel Variables',
  description:
    'List all panel variables for a given Deephaven connection URL. For DHC connections, the response includes a panelUrlFormat in the details to construct panel URLs.',
  inputSchema: {
    connectionUrl: z
      .string()
      .describe(
        'The Deephaven Core / Core+ connection URL (e.g., "http://localhost:10000")'
      ),
  },
  outputSchema: {
    success: z.boolean(),
    message: z.string(),
    executionTimeMs: z.number().describe('Execution time in milliseconds'),
    hint: z.string().optional(),
    details: z
      .object({
        variables: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            type: z.string(),
          })
        ),
        panelUrlFormat: z
          .string()
          .optional()
          .describe(
            'URL format for accessing panel variables. Replace <variableTitle> with the variable title.'
          ),
      })
      .optional(),
  },
} as const;

type Spec = typeof spec;
type HandlerArg = McpToolHandlerArg<Spec>;
type HandlerResult = McpToolHandlerResult<Spec>;
type ListPanelVariablesTool = McpTool<Spec>;

export function createListPanelVariablesTool({
  panelService,
  serverManager,
}: {
  panelService: IPanelService;
  serverManager: IServerManager;
}): ListPanelVariablesTool {
  return {
    name: 'listPanelVariables',
    spec,
    handler: async ({ connectionUrl }: HandlerArg): Promise<HandlerResult> => {
      const response = new McpToolResponse();

      const parsedUrl = parseUrl(connectionUrl);
      if (!parsedUrl.success) {
        return response.error('Invalid URL', parsedUrl.error, {
          connectionUrl,
        });
      }

      try {
        const firstConnectionResult = await getFirstConnectionOrCreate({
          connectionUrl: parsedUrl.value,
          serverManager,
        });

        if (!firstConnectionResult.success) {
          const { details, error, errorMessage, hint } = firstConnectionResult;
          return response.errorWithHint(errorMessage, error, hint, details);
        }

        const variables = [...panelService.getVariables(parsedUrl.value)].map(
          ({ id, title, type }) => ({
            id,
            title,
            type,
          })
        );

        const message = `Found ${variables.length} panel variable(s)`;

        return response.success(message, {
          panelUrlFormat: firstConnectionResult.panelUrlFormat,
          variables,
        });
      } catch (error) {
        return response.error('Failed to list panel variables', error);
      }
    },
  };
}
