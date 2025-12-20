import { z } from 'zod';
import type { McpTool, McpToolHandlerResult } from '../../types';
import type { OutputChannelWithHistory } from '../../util';

const spec = {
  title: 'Get Logs',
  description:
    'Get the log history from the Deephaven debug output channel. Returns all accumulated log messages.',
  inputSchema: {},
  outputSchema: {
    success: z.boolean(),
    logs: z.string(),
  },
} as const;

type Spec = typeof spec;
type GetLogsTool = McpTool<Spec>;

export function createGetLogsTool(
  outputChannelDebug: OutputChannelWithHistory
): GetLogsTool {
  return {
    name: 'getLogs',
    spec,
    handler: async (): Promise<McpToolHandlerResult<Spec>> => {
      try {
        const history = outputChannelDebug.getHistory();
        const logs = history.join('\n');

        const output = {
          success: true,
          logs,
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(output) }],
          structuredContent: output,
        };
      } catch (error) {
        const output = {
          success: false,
          logs: '',
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(output) }],
          structuredContent: output,
        };
      }
    },
  };
}
