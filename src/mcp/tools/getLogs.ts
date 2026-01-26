import { z } from 'zod';
import type {
  McpTool,
  McpToolHandlerArg,
  McpToolHandlerResult,
} from '../../types';
import type { OutputChannelWithHistory } from '../../util';
import { McpToolResponse } from '../utils';

const spec = {
  title: 'Get Logs',
  description:
    'Get the log history from the Deephaven debug output channel. Returns all accumulated log messages.',
  inputSchema: {},
  outputSchema: {
    success: z.boolean(),
    message: z.string(),
    executionTimeMs: z.number().describe('Execution time in milliseconds'),
    details: z
      .object({
        logs: z.string(),
      })
      .optional(),
  },
} as const;

type Spec = typeof spec;
type HandlerArg = McpToolHandlerArg<Spec>;
type HandlerResult = McpToolHandlerResult<Spec>;
type GetLogsTool = McpTool<Spec>;

export function createGetLogsTool({
  outputChannelDebug,
}: {
  outputChannelDebug: OutputChannelWithHistory;
}): GetLogsTool {
  return {
    name: 'getLogs',
    spec,
    handler: async (_args: HandlerArg): Promise<HandlerResult> => {
      const response = new McpToolResponse();

      try {
        const history = outputChannelDebug.getHistory();
        const logs = history.join('\n');

        return response.success('Retrieved log history', { logs });
      } catch (error) {
        return response.error('Failed to retrieve logs', error);
      }
    },
  };
}
