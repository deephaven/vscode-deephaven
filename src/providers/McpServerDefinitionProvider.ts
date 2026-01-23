import * as vscode from 'vscode';
import { MCP_SERVER_NAME } from '../common';
import type { McpServer } from '../mcp/McpServer';
import { DisposableBase } from '../services';

/**
 * Provides MCP server definitions to VS Code Copilot. This allows Copilot to
 * discover and connect to a Deephaven MCP server instance.
 */
export class McpServerDefinitionProvider
  extends DisposableBase
  implements vscode.McpServerDefinitionProvider
{
  constructor(
    private readonly version: string | undefined,
    private readonly mcpServer: McpServer
  ) {
    super();
  }

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
        undefined,
        this.version // Important to tell VS Code when MCP tools may have changed
      ),
    ];
  }
}
