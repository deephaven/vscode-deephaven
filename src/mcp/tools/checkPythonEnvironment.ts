import { z } from 'zod';
import type {
  McpTool,
  McpToolHandlerResult,
  PipServerController,
} from '../../types';
import { McpToolResponse } from '../utils';

const spec = {
  title: 'Check Python Environment',
  description:
    'Check if the Python environment supports starting a Deephaven pip server.',
  inputSchema: {},
  outputSchema: {
    success: z.boolean(),
    message: z.string(),
    executionTimeMs: z.number().describe('Execution time in milliseconds'),
    details: z
      .object({
        isAvailable: z.boolean(),
        interpreterPath: z.string().optional(),
      })
      .optional(),
  },
} as const;

type Spec = typeof spec;
type HandlerResult = McpToolHandlerResult<Spec>;
type CheckPythonEnvTool = McpTool<Spec>;

export function createCheckPythonEnvTool({
  pipServerController,
}: {
  pipServerController: PipServerController | null;
}): CheckPythonEnvTool {
  return {
    name: 'checkPythonEnvironment',
    spec,
    handler: async (): Promise<HandlerResult> => {
      const response = new McpToolResponse();

      if (pipServerController == null) {
        return response.error('PipServerController not available');
      }

      try {
        const result = await pipServerController.checkPipInstall();

        if (result.isAvailable) {
          return response.success('Python environment is available', {
            isAvailable: true,
            interpreterPath: result.interpreterPath,
          });
        }

        return response.success('Python environment is not available', {
          isAvailable: false,
        });
      } catch (error) {
        return response.error('Failed to check Python environment', error);
      }
    },
  };
}
