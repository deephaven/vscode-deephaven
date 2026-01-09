import * as vscode from 'vscode';
import { MCP_SERVER_NAME } from '../common';
import type { McpServer } from '../mcp/McpServer';

/**
 * Provides MCP server definitions to VS Code Copilot. This allows Copilot to
 * discover and connect to a Deephaven MCP server instance.
 */
export class McpServerDefinitionProvider
  implements vscode.McpServerDefinitionProvider
{
  constructor(private readonly mcpServer: McpServer) {}

  /**
   * Provides the definition for the MCP server provided by this extension.
   * Note that the editor will call this method eagerly to ensure the availability
   * of MCP servers for the language model, and so it should not include any
   * operations requiring user interaction such as authentication.
   * @returns An array of MCP server definitions.
   */
  async provideMcpServerDefinitions(): Promise<
    vscode.McpHttpServerDefinition[]
  > {
    const port = this.mcpServer.getPort();
    if (port == null) {
      return [];
    }

    return [
      new vscode.McpHttpServerDefinition(
        MCP_SERVER_NAME,
        vscode.Uri.parse(`http://localhost:${port}/mcp`),
        {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          API_VERSION: '1.0.0',
        },
        '1.0.0'
      ),
    ];
  }
}
