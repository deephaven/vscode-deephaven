import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { RUN_CODE_COMMAND, type RunCodeCmdArgs } from '../../common/commands';
import { z } from 'zod';
import type { McpTool, McpToolHandlerResult } from '../../types';

import type { IServerManager } from '../../types';
import { DhcService, type FilteredWorkspace } from '../../services';
import { isInstanceOf } from '../../util';
import {
  runCodeOutputSchema,
  createResult,
  extractVariables,
} from './runCodeUtils';

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
      const startTime = performance.now();
      try {
        const parsedUri = vscode.Uri.parse(uri);
        let parsedUrl: URL | undefined;

        if (connectionUrl) {
          try {
            parsedUrl = new URL(connectionUrl);
          } catch (e) {
            return createResult(
              false,
              [],
              `Invalid connectionUrl: '${connectionUrl}'. Please provide a valid Deephaven server URL (e.g., 'http://localhost:10000').`,
              performance.now() - startTime
            );
          }
        }

        const cmdArgs: RunCodeCmdArgs = [
          parsedUri,
          undefined,
          constrainTo,
          languageId,
          parsedUrl,
        ];

        const result =
          await vscode.commands.executeCommand<DhcType.ide.CommandResult>(
            RUN_CODE_COMMAND,
            ...cmdArgs
          );

        const errors = getDiagnosticsErrors(pythonDiagnostics);
        if (errors.length > 0) {
          // Look for 'No module named' errors and extract the module names
          const noModuleErrors = new Set(
            errors
              .map(e => /^No module named '([^']+)'/.exec(e.message)?.[1])
              .filter(e => e != null)
          );

          let hint = '';
          if (noModuleErrors.size > 0) {
            // Check if the remote file source plugin is installed
            // Get the connection from the URI that was executed
            const executedConnection = parsedUri
              ? serverManager.getUriConnection(parsedUri)
              : null;
            const hasPlugin =
              executedConnection != null &&
              isInstanceOf(executedConnection, DhcService) &&
              executedConnection.hasRemoteFileSourcePlugin();

            if (!hasPlugin) {
              hint = `\n\nHint: The Python remote file source plugin is not installed. Install it with 'pip install deephaven-plugin-python-remote-file-source' to enable importing workspace packages.`;
            } else {
              const foundUris: string[] = [];

              const rootNodes = pythonWorkspace.getChildNodes(null);

              for (const rootNode of rootNodes) {
                for (const node of pythonWorkspace.iterateNodeTree(
                  rootNode.uri
                )) {
                  if (
                    node.type === 'folder' &&
                    noModuleErrors.has(node.name) &&
                    node.uri
                  ) {
                    foundUris.push(node.uri.toString());
                  }
                }
              }

              if (foundUris.length > 0) {
                hint = `\n\nHint: If this is a package in your workspace, try adding one of these folders as a remote file source using the addRemoteFileSources tool:\n${foundUris.map(u => `- ${u}`).join('\n')}`;
              } else {
                hint = `\n\nHint: If this is a package in your workspace, try adding its folder as a remote file source using the addRemoteFileSources tool.`;
              }
            }
          }
          const errorMsg = errors
            .map(
              e =>
                `${e.uri}: ${e.message} [${e.range.start.line + 1}:${e.range.start.character + 1}]`
            )
            .join('\n');
          // Extract variables from result (before returning error)
          const variables = extractVariables(result);
          return createResult(
            false,
            variables,
            `Code execution failed due to errors:\n${errorMsg}${hint}`,
            performance.now() - startTime
          );
        }

        // Extract variables from result
        const variables = extractVariables(result);

        return createResult(
          true,
          variables,
          undefined,
          performance.now() - startTime
        );
      } catch (error) {
        return createResult(
          false,
          [],
          `Failed to execute code: ${error instanceof Error ? error.message : String(error)}`,
          performance.now() - startTime
        );
      }
    },
  };
}

function getDiagnosticsErrors(diagnostics: vscode.DiagnosticCollection): {
  uri: string;
  message: string;
  range: vscode.Range;
}[] {
  const diagnosticsMap = new Map([...diagnostics]);
  const errors: { uri: string; message: string; range: vscode.Range }[] = [];
  for (const [uri, diags] of diagnosticsMap) {
    for (const diag of diags) {
      if (diag.severity === vscode.DiagnosticSeverity.Error) {
        errors.push({
          uri: uri.toString(),
          message: diag.message,
          range: diag.range,
        });
      }
    }
  }
  return errors;
}
