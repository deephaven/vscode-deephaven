import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { RUN_CODE_COMMAND, type RunCodeCmdArgs } from '../../common/commands';
import { z } from 'zod';
import type { McpTool, McpToolHandlerResult } from '../../types';

import type { IServerManager } from '../../types';
import type { FilteredWorkspace } from '../../services';
import { parseUri, parseUrl } from '../../util';
import {
  runCodeOutputSchema,
  extractVariables,
  getDiagnosticsErrors,
  createPythonModuleErrorHint,
  formatDiagnosticError,
  McpToolResponse,
} from '../utils';
import { assertDefined } from '../../shared';

const spec = {
  title: 'Run Deephaven Code from URI',
  description:
    'Execute code from a workspace file URI in a Deephaven session. Can run the entire file or constrain execution to the current selection within the file.',
  inputSchema: {
    uri: z.string().describe('The file URI to run.'),
    constrainTo: z
      .enum(['selection'])
      .optional()
      .describe(
        'Constrain execution to the current selection within the file specified by uri'
      ),
    languageId: z
      .string()
      .optional()
      .describe(
        'The language ID (python, groovy) to use for execution. If not provided, inferred from the file.'
      ),
    connectionUrl: z
      .string()
      .optional()
      .describe('The Deephaven connection URL to use for execution.'),
  },
  outputSchema: runCodeOutputSchema,
} as const;

type Spec = typeof spec;
type HandlerResult = McpToolHandlerResult<Spec>;
type RunCodeFromUriTool = McpTool<Spec>;

export function createRunCodeFromUriTool(
  pythonDiagnostics: vscode.DiagnosticCollection,
  pythonWorkspace: FilteredWorkspace,
  serverManager: IServerManager
): RunCodeFromUriTool {
  return {
    name: 'runCodeFromUri',
    spec,
    handler: async ({
      uri,
      constrainTo,
      languageId,
      connectionUrl,
    }: {
      uri: string;
      constrainTo?: 'selection';
      languageId?: string;
      connectionUrl?: string;
    }): Promise<HandlerResult> => {
      const response = new McpToolResponse();

      const parsedUriResult = parseUri(uri, true);
      if (!parsedUriResult.success) {
        return response.error('Invalid URI', parsedUriResult.error, { uri });
      }

      const parsedURLResult = parseUrl(connectionUrl);
      if (!parsedURLResult.success) {
        return response.error('Invalid URL', parsedURLResult.error, {
          connectionUrl,
        });
      }

      try {
        const cmdArgs: RunCodeCmdArgs = [
          parsedUriResult.value,
          undefined,
          constrainTo,
          languageId,
          parsedURLResult.value ?? undefined,
        ];

        const result =
          await vscode.commands.executeCommand<DhcType.ide.CommandResult>(
            RUN_CODE_COMMAND,
            ...cmdArgs
          );

        const errors =
          languageId === 'python'
            ? getDiagnosticsErrors(pythonDiagnostics)
            : [];

        if (errors.length > 0) {
          const executedConnection = serverManager.getUriConnection(
            parsedUriResult.value
          );
          assertDefined(executedConnection, 'executedConnection');

          const errorMsg = errors.map(formatDiagnosticError).join('\n');

          const hint = createPythonModuleErrorHint(
            errors,
            executedConnection,
            pythonWorkspace
          );

          // Extract variables from result (before returning error)
          const variables = extractVariables(result);

          return response.error(
            `Code execution failed due to errors:\n${errorMsg}${hint}`,
            { variables }
          );
        }

        // Extract variables from result
        const variables = extractVariables(result);

        return response.success('Code executed successfully', {
          variables,
        });
      } catch (error) {
        return response.error('Failed to execute code', error);
      }
    },
  };
}
