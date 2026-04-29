import { z } from 'zod';
import type {
  IPanelService,
  IServerManager,
  McpTool,
  McpToolHandlerArg,
  McpToolHandlerResult,
} from '../../types';
import { parseUrl } from '../../util';
import {
  createMcpToolOutputSchema,
  getFirstConnectionOrCreate,
  McpToolResponse,
} from '../utils';

const spec = {
  title: 'Display Panel Widget',
  description:
    'Display a Deephaven panel widget inline in chat for a given variable.',
  inputSchema: {
    connectionUrl: z
      .string()
      .describe(
        'The Deephaven connection URL (e.g., "http://localhost:10000")'
      ),
    variableTitle: z.string().describe('Variable title to display'),
  },
  outputSchema: createMcpToolOutputSchema({
    connectionUrl: z.string().optional().describe('Connection URL'),
    panelUrl: z.string().optional().describe('Full URL to the panel widget'),
    panelUrlFormat: z.string().optional().describe('Panel URL format template'),
    variableId: z.string().optional().describe('Variable ID'),
    variableTitle: z.string().optional().describe('Variable title'),
    variableType: z.string().optional().describe('Variable type'),
    variables: z
      .array(
        z.object({
          id: z.string(),
          title: z.string(),
          type: z.string(),
        })
      )
      .optional()
      .describe('Matching variables'),
  }),
  // MCP Apps Protocol: Mark this as an app tool with UI
  _meta: {
    ui: {
      // Base resourceUri - will be overridden dynamically in tool response
      resourceUri: 'ui://deephaven/panel',
      visibility: ['model', 'app'] as const,
    },
    // Legacy format for backward compatibility with MCP SDK v1.x
    // eslint-disable-next-line @typescript-eslint/naming-convention
    'ui/resourceUri': 'ui://deephaven/panel',
  },
} as const;

type Spec = typeof spec;
type HandlerArg = McpToolHandlerArg<Spec>;
type HandlerResult = McpToolHandlerResult<Spec>;
type DisplayPanelWidgetTool = McpTool<Spec>;

export function createDisplayPanelWidgetTool({
  panelService,
  serverManager,
}: {
  panelService: IPanelService;
  serverManager: IServerManager;
}): DisplayPanelWidgetTool {
  return {
    name: 'displayPanelWidget',
    spec,
    handler: async ({
      connectionUrl,
      variableTitle,
    }: HandlerArg): Promise<HandlerResult> => {
      const response = new McpToolResponse();

      // Validate and parse connection URL
      const parsedUrl = parseUrl(connectionUrl);
      if (!parsedUrl.success) {
        return response.error('Invalid URL', parsedUrl.error, {
          connectionUrl,
        });
      }

      // Get or create connection and panel URL format
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

      // Check if panel URL format is available
      if (!firstConnectionResult.panelUrlFormat) {
        return response.errorWithHint(
          'Panel URL format not available',
          null,
          'Server may not support panel widgets',
          {
            connectionUrl,
            panelUrlFormat: firstConnectionResult.panelUrlFormat,
          }
        );
      }

      // Query for first variable matching the title
      const allVariables = [...panelService.getVariables(parsedUrl.value)];
      const matchingVariable = allVariables.find(
        v => v.title === variableTitle
      );

      // Handle no match
      // if (matchingVariable == null) {
      //   return response.error(
      //     `No variable found with title: ${variableTitle}`,
      //     null,
      //     {
      //       connectionUrl,
      //       variableTitle,
      //       variables: allVariables.map(({ id, title, type }) => ({
      //         id,
      //         title,
      //         type,
      //       })),
      //     }
      //   );
      // }

      const {
        id: variableId,
        title,
        type: variableType,
      } = matchingVariable ?? {};

      // Compute panel URL by replacing placeholder with variable title
      const panelUrl = firstConnectionResult.panelUrlFormat.replace(
        '<variableTitle>',
        variableTitle
      );

      // Create MCP Apps UI resource URI with normalized variable title for uniqueness
      const normalizedTitle = encodeURIComponent(variableTitle);
      const resourceUri = `ui://deephaven/panel/${normalizedTitle}`;

      // Create success response with UI metadata in content block's _meta
      // Per MCP SDK v1.x limitation: _meta.ui must be in content blocks, not top-level
      // Content blocks support z.record(z.string(), z.unknown()) which preserves custom fields
      const baseResult = response.success(
        `Displaying panel for variable: ${variableTitle}`,
        {
          connectionUrl,
          variableId,
          variableTitle: title,
          variableType,
          panelUrl,
          panelUrlFormat: firstConnectionResult.panelUrlFormat,
        }
      );

      // Add MCP Apps UI metadata to content block's _meta (SEP-1865)
      // Include both modern (_meta.ui) and legacy (_meta["ui/resourceUri"]) formats
      return {
        content: baseResult.content.map(item => ({
          ...item,
          _meta: {
            ui: {
              resourceUri,
              visibility: ['model', 'app'] as const,
            },
            // Legacy format for backward compatibility
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'ui/resourceUri': resourceUri,
          },
        })),
        structuredContent: baseResult.structuredContent,
      };
    },
  };
}
