import { z } from 'zod';
import type { McpTool, McpToolHandlerResult } from '../../types';
import type { PipServerController } from '../../controllers/PipServerController';

const spec = {
  title: 'Start Pip Server',
  description:
    'Start a managed Deephaven pip server if the environment supports it.',
  inputSchema: {},
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
type StartPipServerTool = McpTool<Spec>;

export function createStartPipServerTool(
  pipServerController: PipServerController
): StartPipServerTool {
  return {
    name: 'startPipServer',
    spec,
    handler: async (): Promise<McpToolHandlerResult<Spec>> => {
      const startTime = performance.now();
      try {
        const result = await pipServerController.checkPipInstall();
        if (!result.isAvailable) {
          const output = {
            success: false,
            message:
              'Pip server environment is not available. The `deephaven-server` package may not be installed.',
            executionTimeMs: performance.now() - startTime,
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(output) }],
            structuredContent: output,
          };
        }
        await pipServerController.startServer();
        const output = {
          success: true,
          message: 'Pip server started successfully.',
          executionTimeMs: performance.now() - startTime,
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(output) }],
          structuredContent: output,
        };
      } catch (error) {
        const output = {
          success: false,
          message: `Failed to start pip server: ${error instanceof Error ? error.message : String(error)}`,
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
