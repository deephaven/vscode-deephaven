import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { RUN_CODE_COMMAND, type RunCodeCmdArgs } from '../../common/commands';
import { z } from 'zod';
import type {
  ConsoleType,
  McpTool,
  McpToolHandlerArg,
  McpToolHandlerResult,
} from '../../types';

import type { IServerManager } from '../../types';
import {
  getConnectionsForConsoleType,
  type FilteredWorkspace,
} from '../../services';
import { parseUri, parseUrl } from '../../util';
import {
  runCodeOutputSchema,
  extractVariables,
  getDiagnosticsErrors,
  createPythonModuleImportErrorHint,
  formatDiagnosticError,
  McpToolResponse,
} from '../utils';
import { assertDefined } from '../../shared';
import { ConnectionNotFoundError } from '../../common';

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
    connectionUrl: z
      .string()
      .optional()
      .describe('The Deephaven connection URL to use for execution.'),
  },
  outputSchema: runCodeOutputSchema,
} as const;

type Spec = typeof spec;
type HandlerArg = McpToolHandlerArg<Spec>;
type HandlerResult = McpToolHandlerResult<Spec>;
type RunCodeFromUriTool = McpTool<Spec>;

export function createRunCodeFromUriTool({
  pythonDiagnostics,
  pythonWorkspace,
  serverManager,
}: {
  pythonDiagnostics: vscode.DiagnosticCollection;
  pythonWorkspace: FilteredWorkspace;
  serverManager: IServerManager;
}): RunCodeFromUriTool {
  return {
    name: 'runCodeFromUri',
    spec,
    handler: async ({
      uri,
      constrainTo,
      connectionUrl,
    }: HandlerArg): Promise<HandlerResult> => {
      const response = new McpToolResponse();

      const parsedUriResult = parseUri(uri, true);
      if (!parsedUriResult.success) {
        return response.error('Invalid URI', parsedUriResult.error, {
          uri,
        });
      }

      // Verify the file exists
      try {
        await vscode.workspace.fs.stat(parsedUriResult.value);
      } catch (error) {
        return response.error('File not found', error, {
          uri: parsedUriResult.value.fsPath,
        });
      }

      const parsedURLResult = parseUrl(connectionUrl);
      if (!parsedURLResult.success) {
        return response.error('Invalid URL', parsedURLResult.error, {
          connectionUrl,
        });
      }

      // Infer languageId from file
      const document = await vscode.workspace.openTextDocument(
        parsedUriResult.value
      );
      const languageId = document.languageId;

      try {
        // This is split out into an Array so that we can get type safety for
        // the command args since the signature for `vscode.commands.executeCommand`
        // takes ...any[]
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

        const pythonErrors =
          languageId === 'python'
            ? getDiagnosticsErrors(pythonDiagnostics)
            : [];

        if (pythonErrors.length > 0) {
          const executedConnection = serverManager.getUriConnection(
            parsedUriResult.value
          );
          assertDefined(executedConnection, 'executedConnection');

          const errorMsg = pythonErrors.map(formatDiagnosticError).join('\n');

          const hint = createPythonModuleImportErrorHint(
            pythonErrors,
            executedConnection,
            pythonWorkspace
          );

          // Extract variables from result (before returning error)
          const variables = extractVariables(result);

          return response.errorWithHint(
            'Code execution failed due to errors',
            errorMsg,
            hint,
            { variables }
          );
        } else if (result.error) {
          return response.error('Code execution failed', result.error, {
            languageId,
          });
        }

        // Extract variables from result
        const variables = extractVariables(result);

        return response.success('Code executed successfully', {
          variables,
        });
      } catch (error) {
        let hint: string | undefined;

        if (error instanceof ConnectionNotFoundError) {
          const hintConnections = await getConnectionsForConsoleType(
            serverManager.getConnections(),
            languageId as ConsoleType
          );

          if (hintConnections.length > 0) {
            hint = `Connection for URL ${connectionUrl} not found. Did you mean to use one of these connections?\n${hintConnections
              .map(c => `- ${c.serverUrl.toString()}`)
              .join('\n')}`;
          } else {
            hint = `No available connections supporting languageId ${languageId}.`;
          }
        }

        return response.errorWithHint('Failed to execute code', error, hint, {
          languageId,
        });
      }
    },
  };
}
