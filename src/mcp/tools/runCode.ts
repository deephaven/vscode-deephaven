import * as vscode from 'vscode';
import { RUN_CODE_COMMAND, type RunCodeCmdArgs } from '../../common/commands';
import { z } from 'zod';
import type { McpTool, McpToolHandlerResult } from '../../types';

const spec = {
  title: 'Run Deephaven Code',
  description:
    'Execute code in a Deephaven session. Runs the code from a file or the current selection.',
  inputSchema: {
    uri: z
      .string()
      .optional()
      .describe(
        'The file URI to run. If not provided, runs the active editor.'
      ),
    constrainTo: z
      .enum(['selection'])
      .optional()
      .describe('Constrain execution to current selection'),
    languageId: z
      .string()
      .optional()
      .describe('The language ID (python, groovy) to use for execution'),
  },
  outputSchema: {
    success: z.boolean(),
    message: z.string(),
  },
} as const;

type Spec = typeof spec;
type HandlerResult = McpToolHandlerResult<Spec>;
type RunCodeTool = McpTool<Spec>;

export const createRunCodeTool = (): RunCodeTool => {
  return {
    name: 'runCode',
    spec,
    handler: async ({
      uri,
      constrainTo,
      languageId,
    }: {
      uri?: string;
      constrainTo?: 'selection';
      languageId?: string;
    }): Promise<HandlerResult> => {
      try {
        const parsedUri = uri ? vscode.Uri.parse(uri) : undefined;
        const cmdArgs: RunCodeCmdArgs = [
          parsedUri,
          undefined,
          constrainTo,
          languageId,
        ];
        await vscode.commands.executeCommand(RUN_CODE_COMMAND, ...cmdArgs);
        const output = { success: true, message: 'Code executed successfully' };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output) }],
          structuredContent: output,
        };
      } catch (error) {
        const output = {
          success: false,
          message: `Failed to execute code: ${error instanceof Error ? error.message : String(error)}`,
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output) }],
          structuredContent: output,
        };
      }
    },
  };
};
