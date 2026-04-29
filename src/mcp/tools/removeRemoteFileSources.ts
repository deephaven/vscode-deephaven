import * as vscode from 'vscode';
import { z } from 'zod';
import { execRemoveRemoteFileSource } from '../../common/commands';
import type {
  McpTool,
  McpToolHandlerArg,
  McpToolHandlerResult,
} from '../../types';
import { URISet } from '../../util/sets';
import { createMcpToolOutputSchema, McpToolResponse } from '../utils';

const spec = {
  title: 'Remove Remote File Sources',
  description:
    'Remove one or more remote file source folders from the workspace.',
  inputSchema: {
    languageId: z
      .string()
      .describe(
        'The language of the remote file sources to remove: "python" or "groovy".'
      ),
    folderUris: z
      .array(z.string())
      .describe('List of folder URIs to remove as remote file sources.'),
  },
  outputSchema: createMcpToolOutputSchema({
    foldersRemoved: z.number().optional(),
    folderUris: z.array(z.string()).optional(),
  }),
} as const;

type Spec = typeof spec;
type HandlerArg = McpToolHandlerArg<Spec>;
type HandlerResult = McpToolHandlerResult<Spec>;
type RemoveRemoteFileSourcesTool = McpTool<Spec>;

export function createRemoveRemoteFileSourcesTool(): RemoveRemoteFileSourcesTool {
  return {
    name: 'removeRemoteFileSources',
    spec,
    handler: async ({
      folderUris,
      languageId,
    }: HandlerArg): Promise<HandlerResult> => {
      const response = new McpToolResponse();

      // Validate languageId
      if (languageId !== 'python' && languageId !== 'groovy') {
        return response.error(
          `Invalid languageId: '${languageId}'. Must be "python" or "groovy".`
        );
      }

      try {
        const uris = folderUris.map(uri =>
          vscode.Uri.parse(uri.replace(/\/$/, ''))
        );

        // Deduplicate URIs using URISet
        const uniqueUris = Array.from(new URISet(uris).values());

        await execRemoveRemoteFileSource(languageId, uniqueUris);

        return response.success('Remote file sources removed successfully', {
          foldersRemoved: uniqueUris.length,
        });
      } catch (error) {
        return response.error('Failed to remove remote file sources', error, {
          folderUris,
        });
      }
    },
  };
}
