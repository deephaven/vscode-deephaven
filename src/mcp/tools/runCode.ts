import * as vscode from 'vscode';
import {
  CONNECT_TO_SERVER_CMD,
  RUN_CODE_COMMAND,
  type RunCodeCmdArgs,
} from '../../common/commands';
import { z } from 'zod';
import type { McpTool, McpToolHandlerResult } from '../../types';

import type { IServerManager } from '../../types';

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
type RunCodeTool = McpTool<Spec>;

export function createRunCodeTool(
  serverManager: IServerManager | null
): RunCodeTool {
  return {
    name: 'runCode',
    spec,
    handler: async ({
      uri,
      constrainTo,
      languageId,
      connectionUrl,
    }: {
      uri?: string;
      constrainTo?: 'selection';
      languageId?: string;
      connectionUrl?: string;
    }): Promise<HandlerResult> => {
      try {
        if (!serverManager) {
          const output = {
            success: false,
            message: 'Server manager not available',
          };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(output) }],
            structuredContent: output,
          };
        }

        let parsedUri = uri ? vscode.Uri.parse(uri) : undefined;
        // If connectionUrl is provided, ensure connection exists and associate editor
        if (connectionUrl) {
          const parsedUrl = new URL(connectionUrl);
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
          if (!parsedUri) {
            // If no URI provided, use active text editor
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
              const output = {
                success: false,
                message: 'No active editor to associate with connection.',
              };
              return {
                content: [
                  { type: 'text' as const, text: JSON.stringify(output) },
                ],
                structuredContent: output,
              };
            }
            parsedUri = activeEditor.document.uri;
          }
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
