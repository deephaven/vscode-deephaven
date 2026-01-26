import * as vscode from 'vscode';
import { z } from 'zod';
import type {
  IServerManager,
  McpTool,
  McpToolHandlerArg,
  McpToolHandlerResult,
} from '../../types';
import { parseUrl } from '../../util';
import { McpToolResponse } from '../utils';

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
    executionTimeMs: z.number().describe('Execution time in milliseconds'),
    details: z
      .object({
        uri: z.string(),
        connectionUrl: z.string(),
      })
      .optional(),
    hint: z.string().optional(),
  },
} as const;

type Spec = typeof spec;
type HandlerArg = McpToolHandlerArg<Spec>;
type HandlerResult = McpToolHandlerResult<Spec>;
type SetEditorConnectionTool = McpTool<Spec>;

export function createSetEditorConnectionTool({
  serverManager,
}: {
  serverManager: IServerManager;
}): SetEditorConnectionTool {
  return {
    name: 'setEditorConnection',
    spec,
    handler: async ({
      uri,
      connectionUrl,
    }: HandlerArg): Promise<HandlerResult> => {
      const response = new McpToolResponse();

      const parsedUrl = parseUrl(connectionUrl);
      if (!parsedUrl.success) {
        return response.error('Invalid URL', parsedUrl.error, {
          connectionUrl,
        });
      }

      try {
        const parsedUri = vscode.Uri.parse(uri);
        const connections = serverManager.getConnections(parsedUrl.value);

        if (!connections.length) {
          return response.errorWithHint(
            'No active connection for the given URL',
            null,
            'Use connectToServer to establish a connection first',
            { connectionUrl }
          );
        }

        const connection = connections[0];
        const doc = await vscode.workspace.openTextDocument(parsedUri);
        const languageId = doc.languageId;

        await serverManager.setEditorConnection(
          parsedUri,
          languageId,
          connection
        );

        return response.success('Editor connection set successfully', {
          uri,
          connectionUrl,
        });
      } catch (error) {
        return response.error('Failed to set editor connection', error, {
          uri,
          connectionUrl,
        });
      }
    },
  };
}
