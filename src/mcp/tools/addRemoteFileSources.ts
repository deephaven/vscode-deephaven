import * as vscode from 'vscode';
import { z } from 'zod';
import { ADD_REMOTE_FILE_SOURCE_CMD } from '../../common/commands';
import type {
  McpTool,
  McpToolHandlerArg,
  McpToolHandlerResult,
} from '../../types';
import { createMcpToolOutputSchema, McpToolResponse } from '../utils';

const spec = {
  title: 'Add Remote File Sources',
  description: 'Add one or more remote file source folders to the workspace.',
  inputSchema: {
    folderUris: z
      .array(z.string())
      .describe('List of folder URIs to add as remote file sources.'),
  },
  outputSchema: createMcpToolOutputSchema({
    foldersAdded: z.number(),
  }),
} as const;

type Spec = typeof spec;
type HandlerArg = McpToolHandlerArg<Spec>;
type HandlerResult = McpToolHandlerResult<Spec>;
type AddRemoteFileSourcesTool = McpTool<Spec>;

export function createAddRemoteFileSourcesTool(): AddRemoteFileSourcesTool {
  return {
    name: 'addRemoteFileSources',
    spec,
    handler: async ({ folderUris }: HandlerArg): Promise<HandlerResult> => {
      const response = new McpToolResponse();

      try {
        const uris = folderUris.map(uri =>
          vscode.Uri.parse(uri.replace(/\/$/, ''))
        );
        await vscode.commands.executeCommand(ADD_REMOTE_FILE_SOURCE_CMD, uris);

        return response.success('Remote file sources added successfully', {
          foldersAdded: uris.length,
        });
      } catch (error) {
        return response.error('Failed to add remote file sources', error);
      }
    },
  };
}
