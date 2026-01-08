import * as vscode from 'vscode';
import { MCP_SERVER_NAME } from '../common';
import type { McpServer } from '../mcp/MCPServer';

/**
 * Provides MCP server definitions to VS Code Copilot. This allows Copilot to
 * discover and connect to a Deephaven MCP server instance.
 */
export class McpServerDefinitionProvider
  implements vscode.McpServerDefinitionProvider
{
  private readonly _onDidChangeMcpServerDefinitions =
    new vscode.EventEmitter<void>();
  readonly onDidChangeMcpServerDefinitions =
    this._onDidChangeMcpServerDefinitions.event;

  constructor(private readonly mcpServer: McpServer) {}

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

  /**
   * Notify VS Code that MCP server definitions have changed.
   * Call this after the MCP server starts or when the port changes.
   */
  refresh(): void {
    this._onDidChangeMcpServerDefinitions.fire();
  }

  dispose(): void {
    this._onDidChangeMcpServerDefinitions.dispose();
  }
}
