import * as vscode from 'vscode';
import { z } from 'zod';
import type {
  McpTool,
  McpToolHandlerArg,
  McpToolHandlerResult,
} from '../../types';
import type { OutputChannelWithHistory } from '../../util';
import { McpToolResponse } from '../utils';

const spec = {
  title: 'Show Output Panel',
  description:
    'Show a Deephaven output panel in the VS Code UI. Can show either the regular output channel or debug channel.',
  inputSchema: {
    channel: z
      .enum(['output', 'debug'])
      .optional()
      .describe(
        'Which output channel to show: "output" for the regular Deephaven output, or "debug" for the debug output. Defaults to "output".'
      ),
  },
  outputSchema: {
    success: z.boolean(),
    message: z.string(),
    executionTimeMs: z.number().describe('Execution time in milliseconds'),
    details: z
      .object({
        channel: z.enum(['output', 'debug']),
      })
      .optional(),
  },
} as const;

type Spec = typeof spec;
type HandlerArg = McpToolHandlerArg<Spec>;
type HandlerResult = McpToolHandlerResult<Spec>;
type ShowOutputPanelTool = McpTool<Spec>;

export function createShowOutputPanelTool({
  outputChannel,
  outputChannelDebug,
}: {
  outputChannel: vscode.OutputChannel;
  outputChannelDebug: OutputChannelWithHistory;
}): ShowOutputPanelTool {
  return {
    name: 'showOutputPanel',
    spec,
    handler: async ({
      channel = 'output',
    }: HandlerArg): Promise<HandlerResult> => {
      const response = new McpToolResponse();

      try {
        if (channel === 'output') {
          outputChannel.show(true);
        } else {
          outputChannelDebug.show(true);
        }

        return response.success('Output panel shown', { channel });
      } catch (error) {
        return response.error('Failed to show output panel', error, {
          channel,
        });
      }
    },
  };
}
