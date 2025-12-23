import * as vscode from 'vscode';
import { ADD_REMOTE_FILE_SOURCE_CMD } from '../../common/commands';
import { z } from 'zod';
import type { McpTool, McpToolHandlerResult } from '../../types';

const spec = {
  title: 'Add Remote File Sources',
  description: 'Add one or more remote file source folders to the workspace.',
  inputSchema: {
    folderUris: z
      .array(z.string())
      .describe('List of folder URIs to add as remote file sources.'),
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
type AddRemoteFileSourcesTool = McpTool<Spec>;

export function createAddRemoteFileSourcesTool(): AddRemoteFileSourcesTool {
  return {
    name: 'addRemoteFileSources',
    spec,
    handler: async ({
      folderUris,
    }: {
      folderUris: string[];
    }): Promise<McpToolHandlerResult<Spec>> => {
      const startTime = performance.now();
      try {
        const uris = folderUris.map(uri =>
          vscode.Uri.parse(uri.replace(/\/$/, ''))
        );
        await vscode.commands.executeCommand(ADD_REMOTE_FILE_SOURCE_CMD, uris);
        const output = {
          success: true,
          message: 'Remote file sources added successfully.',
          executionTimeMs: performance.now() - startTime,
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(output) }],
          structuredContent: output,
        };
      } catch (error) {
        const output = {
          success: false,
          message: `Failed to add remote file sources: ${error instanceof Error ? error.message : String(error)}`,
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
