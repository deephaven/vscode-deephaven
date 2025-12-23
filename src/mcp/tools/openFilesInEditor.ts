import * as vscode from 'vscode';
import { z } from 'zod';
import type { McpTool, McpToolHandlerResult } from '../../types';

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
  outputSchema: {
    success: z.boolean(),
    message: z.string(),
    executionTimeMs: z
      .number()
      .optional()
      .describe('Execution time in milliseconds'),
  },
} as const;

type Spec = typeof spec;
type OpenFilesInEditorTool = McpTool<Spec>;

export function createOpenFilesInEditorTool(): OpenFilesInEditorTool {
  return {
    name: 'openFilesInEditor',
    spec,
    handler: async ({
      uris,
      preview = true,
      preserveFocus = false,
    }: {
      uris: string[];
      preview?: boolean;
      preserveFocus?: boolean;
    }): Promise<McpToolHandlerResult<Spec>> => {
      const startTime = performance.now();
      try {
        for (const uriStr of uris) {
          const uri = vscode.Uri.parse(uriStr);
          await vscode.window.showTextDocument(uri, { preview, preserveFocus });
        }
        const output = {
          success: true,
          message: 'Files opened in editor successfully.',
          executionTimeMs: performance.now() - startTime,
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(output) }],
          structuredContent: output,
        };
      } catch (error) {
        const output = {
          success: false,
          message: `Failed to open files: ${error instanceof Error ? error.message : String(error)}`,
          executionTimeMs: performance.now() - startTime,
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(output) }],
          structuredContent: output,
        };
      }
    },
  };
}
