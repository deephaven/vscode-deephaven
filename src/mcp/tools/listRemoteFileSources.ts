import { z } from 'zod';
import type {
  McpTool,
  McpToolHandlerArg,
  McpToolHandlerResult,
  GroovyPackageName,
  PythonModuleFullname,
} from '../../types';
import { createMcpToolOutputSchema, McpToolResponse } from '../utils';
import type { FilteredWorkspace } from '../../services';

const spec = {
  title: 'List Remote File Sources',
  description: 'List all remote file source folders in the workspace.',
  inputSchema: {
    languageId: z
      .string()
      .optional()
      .describe(
        'The language of the remote file sources to list: "python" or "groovy". If not specified, lists both.'
      ),
  },
  outputSchema: createMcpToolOutputSchema({
    folderUris: z.array(z.string()).optional(),
  }),
} as const;

type Spec = typeof spec;
type HandlerArg = McpToolHandlerArg<Spec>;
type HandlerResult = McpToolHandlerResult<Spec>;
type ListRemoteFileSourcesTool = McpTool<Spec>;

export function createListRemoteFileSourcesTool({
  groovyWorkspace,
  pythonWorkspace,
}: {
  groovyWorkspace: FilteredWorkspace<GroovyPackageName>;
  pythonWorkspace: FilteredWorkspace<PythonModuleFullname>;
}): ListRemoteFileSourcesTool {
  return {
    name: 'listRemoteFileSources',
    spec,
    handler: async ({ languageId }: HandlerArg): Promise<HandlerResult> => {
      const response = new McpToolResponse();

      try {
        const folderUris: string[] = [];

        if (!languageId || languageId === 'groovy') {
          folderUris.push(
            ...groovyWorkspace
              .getTopLevelMarkedFolders()
              .map(folder => folder.uri.toString())
          );
        }

        if (!languageId || languageId === 'python') {
          folderUris.push(
            ...pythonWorkspace
              .getTopLevelMarkedFolders()
              .map(folder => folder.uri.toString())
          );
        }

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
