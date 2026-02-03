import { z } from 'zod';
import type {
  McpTool,
  McpToolHandlerArg,
  McpToolHandlerResult,
} from '../../types';
import { createMcpToolOutputSchema, McpToolResponse } from '../utils';
import type { FilteredWorkspace } from '../../services';

const spec = {
  title: 'List Remote File Sources',
  description: 'List all remote file source folders in the workspace.',
  inputSchema: {},
  outputSchema: createMcpToolOutputSchema({
    folderUris: z.array(z.string()),
  }),
} as const;

type Spec = typeof spec;
type HandlerArg = McpToolHandlerArg<Spec>;
type HandlerResult = McpToolHandlerResult<Spec>;
type ListRemoteFileSourcesTool = McpTool<Spec>;

export function createListRemoteFileSourcesTool(
  pythonWorkspace: FilteredWorkspace
): ListRemoteFileSourcesTool {
  return {
    name: 'listRemoteFileSources',
    spec,
    handler: async (_arg: HandlerArg): Promise<HandlerResult> => {
      const response = new McpToolResponse();

      try {
        const folderUris = pythonWorkspace
          .getTopLevelMarkedFolders()
          .map(folder => folder.uri.toString());

        return response.success(
          `Found ${folderUris.length} remote file source${folderUris.length === 1 ? '' : 's'}`,
          {
            folderUris,
          }
        );
      } catch (error) {
        return response.error('Failed to list remote file sources', error);
      }
    },
  };
}
