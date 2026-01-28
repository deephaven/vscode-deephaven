import { z } from 'zod';
import type { McpTool, McpToolHandlerResult } from '../../types';
import type { OutputChannelWithHistory } from '../../util';
import { McpToolResponse } from '../utils';

const spec = {
  title: 'Get Logs',
  description:
    'Get the log history from the Deephaven output. Returns all accumulated log messages.',
  inputSchema: {
    logType: z
      .enum(['server', 'debug'])
      .describe(
        'Which logs to retrieve: "server" for Deephaven server output, or "debug" for detailed debug logs. Recommended: "debug" for troubleshooting.'
      ),
  },
  outputSchema: {
    success: z.boolean(),
    message: z.string(),
    executionTimeMs: z.number().describe('Execution time in milliseconds'),
    details: z
      .object({
        logs: z
          .string()
          .optional()
          .describe('The log messages as a single string'),
        logType: z.string().optional().describe('The type of logs retrieved'),
      })
      .optional(),
  },
} as const;

type Spec = typeof spec;
type HandlerResult = McpToolHandlerResult<Spec>;
type GetLogsTool = McpTool<Spec>;

export function createGetLogsTool({
  outputChannel,
  outputChannelDebug,
}: {
  outputChannel: OutputChannelWithHistory;
  outputChannelDebug: OutputChannelWithHistory;
}): GetLogsTool {
  return {
    name: 'getLogs',
    spec,
    handler: async ({
      logType,
    }: {
      logType: 'server' | 'debug';
    }): Promise<HandlerResult> => {
      const response = new McpToolResponse();

      try {
        const selectedChannel =
          logType === 'server' ? outputChannel : outputChannelDebug;
        const history = selectedChannel.getHistory();
        const logs = history.join('\n');

        return response.success('Retrieved log history', { logs, logType });
      } catch (error) {
        return response.error('Failed to retrieve logs', error, { logType });
      }
    },
  };
}
