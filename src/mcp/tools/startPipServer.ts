import { z } from 'zod';
import type {
  McpTool,
  McpToolHandlerResult,
  PipServerController,
} from '../../types';
import { McpToolResponse } from '../utils';

const spec = {
  title: 'Start Pip Server',
  description:
    'Start a managed Deephaven pip server if the environment supports it.',
  inputSchema: {},
  outputSchema: {
    success: z.boolean(),
    message: z.string(),
    executionTimeMs: z.number().describe('Execution time in milliseconds'),
    hint: z.string().optional(),
  },
} as const;

type Spec = typeof spec;
type HandlerResult = McpToolHandlerResult<Spec>;
type StartPipServerTool = McpTool<Spec>;

export function createStartPipServerTool({
  pipServerController,
}: {
  pipServerController: PipServerController | null;
}): StartPipServerTool {
  return {
    name: 'startPipServer',
    spec,
    handler: async (): Promise<HandlerResult> => {
      const response = new McpToolResponse();

      if (pipServerController == null) {
        return response.error('PipServerController not available');
      }

      try {
        const result = await pipServerController.checkPipInstall();

        if (!result.isAvailable) {
          return response.errorWithHint(
            'Python environment is not available',
            null,
            'Install the deephaven-server package with: pip install deephaven-server'
          );
        }

        await pipServerController.startServer();
        return response.success('Pip server started successfully');
      } catch (error) {
        return response.error('Failed to start pip server', error);
      }
    },
  };
}
