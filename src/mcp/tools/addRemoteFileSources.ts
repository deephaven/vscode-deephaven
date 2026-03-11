import * as vscode from 'vscode';
import { z } from 'zod';
import { execAddRemoteFileSource } from '../../common/commands';
import type {
  McpTool,
  McpToolHandlerArg,
  McpToolHandlerResult,
} from '../../types';
import { URISet } from '../../util/sets';
import { createMcpToolOutputSchema, McpToolResponse } from '../utils';

const spec = {
  title: 'Add Remote File Sources',
  description:
    'Add folder(s) as remote file sources (allows server to fetch source files on-demand during script execution).',
  inputSchema: {
    languageId: z
      .string()
      .describe(
        'The language of the remote file sources to add: "python" or "groovy". Use "groovy" when adding Groovy package folders.'
      ),
    folderUris: z
      .array(z.string())
      .describe('List of folder URIs to add as remote file sources.'),
  },
  outputSchema: createMcpToolOutputSchema({
    foldersAdded: z.number().optional(),
    folderUris: z.array(z.string()).optional(),
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

        await execAddRemoteFileSource(languageId, uniqueUris);

        return response.success('Remote file sources added successfully', {
          foldersAdded: uniqueUris.length,
        });
      } catch (error) {
        return response.error('Failed to add remote file sources', error, {
          folderUris,
        });
      }
    },
  };
}
