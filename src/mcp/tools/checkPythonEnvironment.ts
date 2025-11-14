import { z } from 'zod';
import type { McpTool, McpToolHandlerResult } from '../../types';
import type { PipServerController } from '../../controllers/PipServerController';

const spec = {
  title: 'Check Python Environment',
  description:
    'Check if the Python environment supports starting a Deephaven pip server.',
  inputSchema: {},
  outputSchema: {
    isAvailable: z.boolean(),
    interpreterPath: z.string().optional(),
    message: z.string(),
  },
} as const;

type Spec = typeof spec;
type CheckPythonEnvTool = McpTool<Spec>;

export function createCheckPythonEnvTool(
  pipServerController: PipServerController | null
): CheckPythonEnvTool {
  return {
    name: 'checkPythonEnvironment',
    spec,
    handler: async (): Promise<McpToolHandlerResult<Spec>> => {
      if (!pipServerController) {
        const output = {
          isAvailable: false,
          message: 'PipServerController not available',
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(output) }],
          structuredContent: output,
        };
      }
      try {
        const result = await pipServerController.checkPipInstall();
        const output = {
          isAvailable: result.isAvailable,
          interpreterPath: result.isAvailable
            ? result.interpreterPath
            : undefined,
          message: result.isAvailable
            ? 'Python environment is available for pip server.'
            : 'Python environment is not available for pip server.',
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(output) }],
          structuredContent: output,
        };
      } catch (error) {
        const output = {
          isAvailable: false,
          message: `Failed to check Python environment: ${error instanceof Error ? error.message : String(error)}`,
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(output) }],
          structuredContent: output,
        };
      }
    },
  };
}
