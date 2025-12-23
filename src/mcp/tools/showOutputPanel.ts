import * as vscode from 'vscode';
import { z } from 'zod';
import type { McpTool, McpToolHandlerResult } from '../../types';
import type { OutputChannelWithHistory } from '../../util';

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
    executionTimeMs: z
      .number()
      .optional()
      .describe('Execution time in milliseconds'),
  },
} as const;

type Spec = typeof spec;
type ShowOutputPanelTool = McpTool<Spec>;

export function createShowOutputPanelTool(
  outputChannel: vscode.OutputChannel,
  outputChannelDebug: OutputChannelWithHistory
): ShowOutputPanelTool {
  return {
    name: 'showOutputPanel',
    spec,
    handler: async ({
      channel = 'output',
    }): Promise<McpToolHandlerResult<Spec>> => {
      const startTime = performance.now();
      try {
        if (channel === 'output') {
          outputChannel.show(true);
        } else {
          outputChannelDebug.show(true);
        }

        const output = {
          success: true,
          message: `Deephaven ${channel} panel shown successfully.`,
          executionTimeMs: performance.now() - startTime,
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(output) }],
          structuredContent: output,
        };
      } catch (error) {
        const output = {
          success: false,
          message: `Failed to show output panel: ${error instanceof Error ? error.message : String(error)}`,
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
