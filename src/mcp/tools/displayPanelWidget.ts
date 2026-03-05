import { z } from 'zod';
import type {
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
    variableId: z.string().describe('Variable ID to display'),
    variableTitle: z.string().describe('Variable title'),
    variableType: z.string().describe('Variable type (Table, Figure, etc.)'),
  },
  outputSchema: createMcpToolOutputSchema({
    connectionUrl: z.string().optional().describe('Connection URL'),
    panelUrl: z.string().optional().describe('Full URL to the panel widget'),
    panelUrlFormat: z.string().optional().describe('Panel URL format template'),
    variableId: z.string().optional().describe('Variable ID'),
    variableTitle: z.string().optional().describe('Variable title'),
    variableType: z.string().optional().describe('Variable type'),
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
  serverManager,
}: {
  serverManager: IServerManager;
}): DisplayPanelWidgetTool {
  return {
    name: 'displayPanelWidget',
    spec,
    handler: async ({
      connectionUrl,
      variableId,
      variableTitle,
      variableType,
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

      // Construct full panel URL by replacing <variableTitle> placeholder
      const panelUrl = firstConnectionResult.panelUrlFormat.replace(
        '<variableTitle>',
        encodeURIComponent(variableTitle)
      );

      // Create MCP Apps UI resource URI
      const resourceUri = 'ui://deephaven/panel';

      // Create success response with UI metadata in content block's _meta
      // Per MCP SDK v1.x limitation: _meta.ui must be in content blocks, not top-level
      // Content blocks support z.record(z.string(), z.unknown()) which preserves custom fields
      const baseResult = response.success(
        `Displaying ${variableType} panel: ${variableTitle}`,
        {
          connectionUrl,
          panelUrl,
          variableId,
          variableTitle,
          variableType,
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
