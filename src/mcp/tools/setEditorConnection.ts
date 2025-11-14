import * as vscode from 'vscode';
import { z } from 'zod';
import type {
  IServerManager,
  McpTool,
  McpToolHandlerResult,
} from '../../types';

const spec = {
  title: 'Set Editor Connection',
  description:
    'Set the connection for a given editor by URI and connection URL.',
  inputSchema: {
    uri: z.string().describe('The file URI of the editor.'),
    connectionUrl: z.string().describe('The Deephaven connection URL.'),
  },
  outputSchema: {
    success: z.boolean(),
    message: z.string(),
  },
} as const;

type Spec = typeof spec;
type HandlerResult = McpToolHandlerResult<Spec>;
type SetEditorConnectionTool = McpTool<Spec>;

export function createSetEditorConnectionTool(
  serverManager: IServerManager
): SetEditorConnectionTool {
  return {
    name: 'setEditorConnection',
    spec,
    handler: async ({
      uri,
      connectionUrl,
    }: {
      uri: string;
      connectionUrl: string;
    }): Promise<HandlerResult> => {
      try {
        const parsedUri = vscode.Uri.parse(uri);
        const parsedUrl = new URL(connectionUrl);
        const connections = serverManager.getConnections(parsedUrl);
        if (!connections.length) {
          const output = {
            success: false,
            message: 'No active connection for the given URL',
          };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(output) }],
            structuredContent: output,
          };
        }
        const connection = connections[0];
        const doc = await vscode.workspace.openTextDocument(parsedUri);
        const languageId = doc.languageId;
        await serverManager.setEditorConnection(
          parsedUri,
          languageId,
          connection
        );
        const output = {
          success: true,
          message: 'Editor connection set successfully',
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output) }],
          structuredContent: output,
        };
      } catch (error) {
        const output = {
          success: false,
          message: `Failed to set editor connection: ${error instanceof Error ? error.message : String(error)}`,
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output) }],
          structuredContent: output,
        };
      }
    },
  };
}
