import * as vscode from 'vscode';
import { z } from 'zod';
import type {
  McpTool,
  McpToolHandlerArg,
  McpToolHandlerResult,
} from '../../types';
import { createMcpToolOutputSchema, McpToolResponse } from '../utils';

const spec = {
  title: 'Open Files in Editor',
  description: 'Open one or more files in the VS Code editor.',
  inputSchema: {
    uris: z
      .array(z.string())
      .describe('List of file URIs to open in the editor.'),
    preview: z
      .boolean()
      .optional()
      .describe('Open in preview mode (default: true).'),
    preserveFocus: z
      .boolean()
      .optional()
      .describe('Preserve focus in the current editor group (default: false).'),
  },
  outputSchema: createMcpToolOutputSchema({
    filesOpened: z.number(),
  }),
} as const;

type Spec = typeof spec;
type HandlerArg = McpToolHandlerArg<Spec>;
type HandlerResult = McpToolHandlerResult<Spec>;
type OpenFilesInEditorTool = McpTool<Spec>;

export function createOpenFilesInEditorTool(): OpenFilesInEditorTool {
  return {
    name: 'openFilesInEditor',
    spec,
    handler: async ({
      uris,
      preview = true,
      preserveFocus = false,
    }: HandlerArg): Promise<HandlerResult> => {
      const response = new McpToolResponse();

      try {
        for (const uriStr of uris) {
          const uri = vscode.Uri.parse(uriStr);
          await vscode.window.showTextDocument(uri, { preview, preserveFocus });
        }

        return response.success('Files opened in editor successfully', {
          filesOpened: uris.length,
        });
      } catch (error) {
        return response.error('Failed to open files', error);
      }
    },
  };
}
