import * as vscode from 'vscode';
import {
  MCP_DOCS_SERVER_NAME,
  MCP_DOCS_SERVER_URL,
  MCP_SERVER_NAME,
} from '../common';
import type { McpServer } from '../mcp/McpServer';
import { DisposableBase } from '../services';
import type { IConfigService, McpVersion } from '../types';

/**
 * Provides MCP server definitions to VS Code Copilot. This allows Copilot to
 * discover and connect to Deephaven MCP server instances (both the main server
 * and the documentation server).
 */
export class McpServerDefinitionProvider
  extends DisposableBase
  implements vscode.McpServerDefinitionProvider
{
  private readonly _onDidChangeMcpServerDefinitions =
    new vscode.EventEmitter<void>();
  readonly onDidChangeMcpServerDefinitions =
    this._onDidChangeMcpServerDefinitions.event;

  private mcpServer: McpServer | null = null;

  constructor(
    private readonly mcpVersion: McpVersion,
    private readonly config: IConfigService
  ) {
    super();
    this.disposables.add(this._onDidChangeMcpServerDefinitions);
  }

  /**
   * Set the MCP server reference.
   */
  setMcpServer(server: McpServer | null): void {
    this.mcpServer = server;
  }

  /**
   * Notify VS Code that MCP server definitions have changed.
   * Call this when the server starts/stops, tools change, or config changes.
   */
  refresh(): void {
    this._onDidChangeMcpServerDefinitions.fire();
  }

  /**
   * Provides the definitions for MCP servers provided by this extension.
   * Returns the main Deephaven MCP server (if running) and optionally the
   * Deephaven Documentation MCP server (if enabled in configuration).
   *
   * Note that the editor will call this method eagerly to ensure the availability
   * of MCP servers for the language model, and so it should not include any
   * operations requiring user interaction such as authentication.
   * @returns An array of MCP server definitions.
   */
  async provideMcpServerDefinitions(): Promise<
    vscode.McpHttpServerDefinition[]
  > {
    const port = this.mcpServer?.getPort();
    if (port == null) {
      return [];
    }

    const servers: vscode.McpHttpServerDefinition[] = [];

    servers.push(
      new vscode.McpHttpServerDefinition(
        MCP_SERVER_NAME,
        vscode.Uri.parse(`http://localhost:${port}/mcp`),
        undefined,
        this.mcpVersion // Important to tell VS Code when MCP tools may have changed
      )
    );

    // Add documentation server if both MCP and docs are enabled
    if (this.config.isMcpDocsEnabled()) {
      servers.push(
        new vscode.McpHttpServerDefinition(
          MCP_DOCS_SERVER_NAME,
          vscode.Uri.parse(MCP_DOCS_SERVER_URL)
        )
      );
    }

    return servers;
  }
}
