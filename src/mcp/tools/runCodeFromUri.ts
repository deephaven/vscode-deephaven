import * as vscode from 'vscode';
import { execRunCode } from '../../common/commands';
import { z } from 'zod';
import type {
  McpTool,
  McpToolHandlerArg,
  McpToolHandlerResult,
  GroovyPackageName,
  PythonModuleFullname,
} from '../../types';

import type { IServerManager } from '../../types';
import { type FilteredWorkspace } from '../../services';
import { parseUri, parseUrl } from '../../util';
import {
  runCodeOutputSchema,
  extractVariables,
  getDiagnosticsErrors,
  createGroovyImportErrorHint,
  createPythonModuleImportErrorHint,
  formatDiagnosticError,
  createConnectionNotFoundHint,
  McpToolResponse,
  getFirstConnectionOrCreate,
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
      .describe('The Deephaven connection URL to use for execution.'),
  },
  outputSchema: runCodeOutputSchema,
} as const;

type Spec = typeof spec;
type HandlerArg = McpToolHandlerArg<Spec>;
type HandlerResult = McpToolHandlerResult<Spec>;
type RunCodeFromUriTool = McpTool<Spec>;

export function createRunCodeFromUriTool({
  groovyDiagnostics,
  groovyWorkspace,
  pythonDiagnostics,
  pythonWorkspace,
  serverManager,
}: {
  groovyDiagnostics: vscode.DiagnosticCollection;
  groovyWorkspace: FilteredWorkspace<GroovyPackageName>;
  pythonDiagnostics: vscode.DiagnosticCollection;
  pythonWorkspace: FilteredWorkspace<PythonModuleFullname>;
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
        const firstConnectionResult = await getFirstConnectionOrCreate({
          serverManager,
          connectionUrl: parsedURLResult.value,
          languageId,
        });

        if (!firstConnectionResult.success) {
          const { details, error, errorMessage, hint } = firstConnectionResult;
          return response.errorWithHint(errorMessage, error, hint, details);
        }

        const { panelUrlFormat } = firstConnectionResult;

        const result = await execRunCode(
          parsedUriResult.value,
          undefined,
          constrainTo,
          languageId,
          parsedURLResult.value
        );

        // Extract variables from result
        const variables = extractVariables(result);

        if (result?.error) {
          let errorMsg = result.error;
          let hintResult:
            | { hint: string; foundMatchingFolderUris: string[] }
            | undefined;

          if (languageId === 'python') {
            const executedConnection = serverManager.getUriConnection(
              parsedUriResult.value
            );
            assertDefined(executedConnection, 'executedConnection');

            const pythonErrors = getDiagnosticsErrors(pythonDiagnostics);

            if (pythonErrors.length > 0) {
              errorMsg = pythonErrors.map(formatDiagnosticError).join('\n');
            }

            hintResult = createPythonModuleImportErrorHint(
              pythonErrors,
              executedConnection,
              pythonWorkspace,
              result.error
            );
          } else if (languageId === 'groovy') {
            const executedConnection = serverManager.getUriConnection(
              parsedUriResult.value
            );
            assertDefined(executedConnection, 'executedConnection');

            const groovyErrors = getDiagnosticsErrors(groovyDiagnostics);

            if (groovyErrors.length > 0) {
              errorMsg = groovyErrors.map(formatDiagnosticError).join('\n');
            }

            hintResult = createGroovyImportErrorHint(
              groovyErrors,
              executedConnection,
              groovyWorkspace,
              result.error
            );
          }

          const { hint, foundMatchingFolderUris } = hintResult ?? {};

          return response.errorWithHint(
            'Code execution failed',
            errorMsg,
            hint,
            {
              languageId,
              variables,
              foundMatchingFolderUris,
            }
          );
        }

        return response.success('Code executed successfully', {
          variables,
          panelUrlFormat,
        });
      } catch (error) {
        let hint: string | undefined;

        if (error instanceof ConnectionNotFoundError) {
          hint = await createConnectionNotFoundHint(
            serverManager,
            connectionUrl,
            languageId
          );
        }

        return response.errorWithHint('Failed to execute code', error, hint, {
          languageId,
        });
      }
    },
  };
}
