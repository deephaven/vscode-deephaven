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
    folders: z
      .array(
        z.object({
          uri: z.string(),
          languageId: z.enum(['groovy', 'python']),
        })
      )
      .optional(),
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
        // Validate languageId if provided
        if (languageId && languageId !== 'groovy' && languageId !== 'python') {
          return response.error(
            `Unsupported languageId: "${languageId}". Must be "groovy" or "python".`
          );
        }

        const folders: Array<{ uri: string; languageId: 'groovy' | 'python' }> =
          [];

        if (!languageId || languageId === 'groovy') {
          folders.push(
            ...groovyWorkspace.getTopLevelMarkedFolders().map(folder => ({
              uri: folder.uri.toString(),
              languageId: 'groovy' as const,
            }))
          );
        }

        if (!languageId || languageId === 'python') {
          folders.push(
            ...pythonWorkspace.getTopLevelMarkedFolders().map(folder => ({
              uri: folder.uri.toString(),
              languageId: 'python' as const,
            }))
          );
        }

        return response.success(
          `Found ${folders.length} remote file source${folders.length === 1 ? '' : 's'}`,
          {
            folders,
          }
        );
      } catch (error) {
        return response.error('Failed to list remote file sources', error);
      }
    },
  };
}
