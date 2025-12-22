import * as vscode from 'vscode';
import {
  CONNECT_TO_SERVER_CMD,
  RUN_CODE_COMMAND,
  type RunCodeCmdArgs,
} from '../../common/commands';
import { z } from 'zod';
import type { McpTool, McpToolHandlerResult } from '../../types';

import type { IServerManager } from '../../types';
import { DhcService, type FilteredWorkspace } from '../../services';
import { isInstanceOf } from '../../util';

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
  outputSchema: {
    success: z.boolean(),
    message: z.string(),
  },
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
      try {
        let parsedUri = vscode.Uri.parse(uri);
        // If connectionUrl is provided, ensure connection exists and associate editor
        if (connectionUrl) {
          let parsedUrl: URL;
          try {
            parsedUrl = new URL(connectionUrl);
          } catch (e) {
            const output = {
              success: false,
              message: `Invalid connectionUrl: '${connectionUrl}'. Please provide a valid Deephaven server URL (e.g., 'http://localhost:10000'). If this was a server label, use listServers to find the corresponding URL.`,
            };
            return {
              content: [{ type: 'text', text: JSON.stringify(output) }],
              structuredContent: output,
            };
          }
          let connections = serverManager.getConnections(parsedUrl);
          if (!connections.length) {
            // Try to connect (DHC only, for DHE user must use connectToServer first)
            const server = serverManager.getServer(parsedUrl);
            if (!server) {
              const output = {
                success: false,
                message: `Server not found: ${connectionUrl}`,
              };
              return {
                content: [
                  { type: 'text' as const, text: JSON.stringify(output) },
                ],
                structuredContent: output,
              };
            }
            if (server.type === 'DHC') {
              const serverState = { type: server.type, url: server.url };
              await vscode.commands.executeCommand(
                CONNECT_TO_SERVER_CMD,
                serverState
              );
              // Wait for connection to be established (could poll or just re-fetch)
              connections = serverManager.getConnections(parsedUrl);
              if (!connections.length) {
                const output = {
                  success: false,
                  message: `Failed to connect to server: ${connectionUrl}`,
                };
                return {
                  content: [
                    { type: 'text' as const, text: JSON.stringify(output) },
                  ],
                  structuredContent: output,
                };
              }
            } else {
              const output = {
                success: false,
                message: `No active connection to ${connectionUrl}. Use connectToServer first.`,
              };
              return {
                content: [
                  { type: 'text' as const, text: JSON.stringify(output) },
                ],
                structuredContent: output,
              };
            }
          }
          // Set editor connection
          const connection = connections[0];
          const doc = await vscode.workspace.openTextDocument(parsedUri);
          const langId = languageId || doc.languageId;
          await serverManager.setEditorConnection(
            parsedUri,
            langId,
            connection
          );
        }
        const cmdArgs: RunCodeCmdArgs = [
          parsedUri,
          undefined,
          constrainTo,
          languageId,
        ];
        await vscode.commands.executeCommand(RUN_CODE_COMMAND, ...cmdArgs);

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
          const output = {
            success: false,
            message: `Code execution failed due to errors:\n${errorMsg}${hint}`,
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(output) }],
            structuredContent: output,
          };
        }

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
