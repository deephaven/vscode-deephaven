import { z } from 'zod';
import type { McpTool, McpToolHandlerResult } from '../../types';
import type { OutputChannelWithHistory } from '../../util';
import { McpToolResponse } from '../utils';

const OUTPUT_TYPES = ['server', 'debug'] as const;

const spec = {
  title: 'Show Output Panel',
  description:
    'Show a Deephaven output panel in the VS Code UI. Can show either the server output or debug output.',
  inputSchema: {
    outputType: z
      .enum(OUTPUT_TYPES)
      .describe(
        'Which output to show: "server" for Deephaven server output, or "debug" for detailed debug output. Recommended: "server" for general use.'
      ),
  },
  outputSchema: {
    success: z.boolean(),
    message: z.string(),
    executionTimeMs: z.number().describe('Execution time in milliseconds'),
    details: z.object({
      outputType: z
        .enum(OUTPUT_TYPES)
        .describe('The type of output panel shown'),
    }),
  },
} as const;

type Spec = typeof spec;
type HandlerResult = McpToolHandlerResult<Spec>;
type ShowOutputPanelTool = McpTool<Spec>;

export function createShowOutputPanelTool({
  outputChannel,
  outputChannelDebug,
}: {
  outputChannel: OutputChannelWithHistory;
  outputChannelDebug: OutputChannelWithHistory;
}): ShowOutputPanelTool {
  return {
    name: 'showOutputPanel',
    spec,
    handler: async ({
      outputType,
    }: {
      outputType: 'server' | 'debug';
    }): Promise<HandlerResult> => {
      const response = new McpToolResponse();

      try {
        if (outputType === 'server') {
          outputChannel.show(true);
        } else {
          outputChannelDebug.show(true);
        }

        return response.success('Output panel shown', { outputType });
      } catch (error) {
        return response.error('Failed to show output panel', error, {
          outputType,
        });
      }
    },
  };
}
