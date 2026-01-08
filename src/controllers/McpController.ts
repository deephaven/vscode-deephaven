import * as vscode from 'vscode';
import { ControllerBase } from './ControllerBase';
import { McpServer } from '../mcp';
import { McpServerDefinitionProvider } from '../providers';
import type { IServerManager, IConfigService } from '../types';
import type { FilteredWorkspace } from '../services';
import { isWindsurf, Logger } from '../util';
import {
  COPY_MCP_URL_CMD,
  MCP_SERVER_NAME,
  MCP_SERVER_PORT_STORAGE_KEY,
} from '../common';

const logger = new Logger('McpController');

/**
 * Controller for managing the MCP (Model Context Protocol) server.
 * Handles server lifecycle, status bar updates, and configuration.
 */
export class McpController extends ControllerBase {
  private _context: vscode.ExtensionContext;
  private _config: IConfigService;
  private _serverManager: IServerManager;
  private _pythonDiagnostics: vscode.DiagnosticCollection;
  private _pythonWorkspace: FilteredWorkspace;

  private _mcpServer: McpServer | null = null;
  private _mcpServerDefinitionProvider: McpServerDefinitionProvider | null =
    null;
  private _mcpStatusBarItem: vscode.StatusBarItem | null = null;

  constructor(
    context: vscode.ExtensionContext,
    config: IConfigService,
    serverManager: IServerManager,
    pythonDiagnostics: vscode.DiagnosticCollection,
    pythonWorkspace: FilteredWorkspace
  ) {
    super();

    this._context = context;
    this._config = config;
    this._serverManager = serverManager;
    this._pythonDiagnostics = pythonDiagnostics;
    this._pythonWorkspace = pythonWorkspace;

    // Register copy MCP URL command
    this.registerCommand(COPY_MCP_URL_CMD, this.copyUrl, this);

    // Register configuration change handler
    let isMcpEnabledPrev = this._config.isMcpEnabled();
    vscode.workspace.onDidChangeConfiguration(
      () => {
        if (this._config.isMcpEnabled() !== isMcpEnabledPrev) {
          isMcpEnabledPrev = !isMcpEnabledPrev;
          this.initializeStatusBar();
          this.initializeMcpServer();
        }
      },
      null,
      this.disposables
    );

    // Register window state change handler to update Windsurf MCP config
    vscode.window.onDidChangeWindowState(
      () => this.maybeUpdateWindsurfMcpConfig(),
      null,
      this.disposables
    );

    this.initializeStatusBar();
    this.initializeMcpServer();
  }

  /**
   * Initialize and start the MCP server if enabled.
   */
  async initializeMcpServer(): Promise<void> {
    // If server is already running, stop it
    if (this._mcpServer != null) {
      this._mcpServer.stop();
      this._mcpServer = null;

      logger.info('MCP Server stopped.');
      vscode.window.showInformationMessage('Deephaven MCP Server stopped.');
    }

    if (!this._config.isMcpEnabled()) {
      return;
    }

    try {
      // Create and start MCP server
      this._mcpServer = new McpServer(
        this._pythonDiagnostics,
        this._pythonWorkspace,
        this._serverManager
      );
      this.disposables.push(this._mcpServer);

      // Try to use previously stored port for consistency across sessions within the workspace
      const storedPort = this._context.workspaceState.get<number>(
        MCP_SERVER_PORT_STORAGE_KEY
      );

      const actualPort = await this._mcpServer.start(storedPort);
      logger.info(`MCP Server started on port ${actualPort}`);

      vscode.window.showInformationMessage(
        `Deephaven MCP Server started on port ${actualPort}.`
      );

      // Update status bar
      this.updateStatusBar(actualPort);

      // Store the port for next session (only if different from stored)
      if (actualPort !== storedPort) {
        await this._context.workspaceState.update(
          MCP_SERVER_PORT_STORAGE_KEY,
          actualPort
        );
      }

      // Auto-configure Windsurf MCP config if running in Windsurf
      if (isWindsurf()) {
        await this._config.updateWindsurfMcpConfig(actualPort);

        // Windsurf doesn't support registering MCP servers via `vscode.lm,` so we're done
        return;
      }

      // Register provider for VS Code Copilot
      this._mcpServerDefinitionProvider = new McpServerDefinitionProvider(
        this._mcpServer
      );
      this.disposables.push(this._mcpServerDefinitionProvider);

      this.disposables.push(
        vscode.lm.registerMcpServerDefinitionProvider(
          'deephaven-vscode.mcpServer',
          this._mcpServerDefinitionProvider
        )
      );

      // Notify VS Code to refresh MCP tool cache. TBD: whether this is actually
      // needed, but I've had some issues where tools seem to get cached and
      // "stuck" as I've iterated on the extension.
      this._mcpServerDefinitionProvider.refresh();
    } catch (error) {
      // Don't fail extension activation if MCP server fails
      logger.error('Failed to initialize MCP server:', error);
      vscode.window.showErrorMessage(
        `Failed to initialize MCP server: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Initialize the MCP status bar item.
   */
  private initializeStatusBar(): void {
    if (this._mcpStatusBarItem != null) {
      this._mcpStatusBarItem.dispose();
      this._mcpStatusBarItem = null;
    }

    if (!this._config.isMcpEnabled()) {
      return;
    }

    this._mcpStatusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      200
    );
    this._mcpStatusBarItem.command = COPY_MCP_URL_CMD;
    this.disposables.push(this._mcpStatusBarItem);
  }

  /**
   * Update MCP status bar with current port.
   * @param port The port the MCP server is running on, or null to hide the status bar
   */
  private updateStatusBar(port: number | null): void {
    if (this._mcpStatusBarItem == null) {
      return;
    }

    if (port == null) {
      this._mcpStatusBarItem.hide();
      return;
    }

    this._mcpStatusBarItem.text = `$(dh-ext-logo) MCP: ${port}`;
    this._mcpStatusBarItem.tooltip = `Deephaven MCP Server running on port ${port}. Click to copy URL.`;
    this._mcpStatusBarItem.show();
  }

  /**
   * Copy the MCP server URL to clipboard.
   */
  async copyUrl(): Promise<void> {
    const port = this._mcpServer?.getPort();
    if (port == null) {
      vscode.window.showWarningMessage('MCP Server is not running.');
      return;
    }

    const mcpUrl = `http://localhost:${port}/mcp`;
    await vscode.env.clipboard.writeText(mcpUrl);

    // Ensure Windsurf MCP config is updated if user copies URL manually
    if (isWindsurf() && (await this._config.updateWindsurfMcpConfig(port))) {
      vscode.window.showInformationMessage(
        `MCP URL copied and Windsurf config updated with '${MCP_SERVER_NAME}' server.`
      );
      return;
    }

    vscode.window.showInformationMessage(
      `MCP URL copied to clipboard: ${mcpUrl}`
    );
  }

  /**
   * Check and update Windsurf MCP config if window gains focus.
   * Only runs in Windsurf and when window is active and focused.
   */
  async maybeUpdateWindsurfMcpConfig(): Promise<void> {
    const shouldUpdate =
      isWindsurf() && vscode.window.state.active && vscode.window.state.focused;

    if (!shouldUpdate) {
      return;
    }

    const port = this._mcpServer?.getPort();
    if (port == null) {
      return;
    }

    await this._config.updateWindsurfMcpConfig(port);
  }

  /**
   * Stop the MCP server.
   */
  async stop(): Promise<void> {
    await this._mcpServer?.stop();
  }
}
