import * as vscode from 'vscode';
import { ControllerBase } from './ControllerBase';
import { McpServer } from '../mcp';
import { McpServerDefinitionProvider } from '../providers';
import type {
  IPanelService,
  IServerManager,
  IConfigService,
  McpVersion,
} from '../types';
import type { FilteredWorkspace } from '../services';
import { isWindsurf, Logger, OutputChannelWithHistory } from '../util';
import {
  COPY_MCP_URL_CMD,
  MCP_SERVER_KEY,
  MCP_SERVER_NAME,
  MCP_SERVER_PORT_STORAGE_KEY,
  SHOW_MCP_QUICK_PICK_CMD,
  TOGGLE_MCP_CMD,
} from '../common';

const logger = new Logger('McpController');

interface McpQuickPickItem extends vscode.QuickPickItem {
  action: 'enable' | 'disable' | 'copy';
}

/**
 * Controller for managing the MCP (Model Context Protocol) server.
 * Handles server lifecycle, status bar updates, and configuration.
 */
export class McpController extends ControllerBase {
  private _context: vscode.ExtensionContext;
  private _config: IConfigService;
  private _mcpVersion: McpVersion;
  private _serverManager: IServerManager;
  private _pythonDiagnostics: vscode.DiagnosticCollection;
  private _pythonWorkspace: FilteredWorkspace;
  private _outputChannel: OutputChannelWithHistory;
  private _outputChannelDebug: OutputChannelWithHistory;
  private _panelService: IPanelService;

  private _mcpServer: McpServer | null = null;
  private _mcpServerDefinitionProvider: McpServerDefinitionProvider | null =
    null;
  private _mcpStatusBarItem: vscode.StatusBarItem | null = null;

  constructor(
    context: vscode.ExtensionContext,
    config: IConfigService,
    mcpVersion: McpVersion,
    serverManager: IServerManager,
    pythonDiagnostics: vscode.DiagnosticCollection,
    pythonWorkspace: FilteredWorkspace,
    outputChannel: OutputChannelWithHistory,
    outputChannelDebug: OutputChannelWithHistory,
    panelService: IPanelService
  ) {
    super();

    this._context = context;
    this._config = config;
    this._mcpVersion = mcpVersion;
    this._serverManager = serverManager;
    this._pythonDiagnostics = pythonDiagnostics;
    this._pythonWorkspace = pythonWorkspace;
    this._outputChannel = outputChannel;
    this._outputChannelDebug = outputChannelDebug;
    this._panelService = panelService;

    // Register copy MCP URL command
    this.registerCommand(COPY_MCP_URL_CMD, this.copyUrl, this);

    // Register toggle MCP command
    this.registerCommand(TOGGLE_MCP_CMD, () => this._config.toggleMcp(), this);

    // Register show MCP quick pick command
    this.registerCommand(SHOW_MCP_QUICK_PICK_CMD, this.showMcpQuickPick, this);

    // Register configuration change handler
    let isMcpDocsEnabledPrev = this._config.isMcpDocsEnabled();
    let isMcpEnabledPrev = this._config.isMcpEnabled();
    vscode.workspace.onDidChangeConfiguration(
      () => {
        const isMcpDocsEnabledCur = this._config.isMcpDocsEnabled();
        const isMcpEnabledCur = this._config.isMcpEnabled();

        // Re-initialize if MCP enabled state changed
        if (isMcpEnabledCur !== isMcpEnabledPrev) {
          this.initializeStatusBar();
          this.initializeMcpServer();
        }
        // Refresh provider if docs enabled state changed
        else if (isMcpDocsEnabledCur !== isMcpDocsEnabledPrev) {
          this._mcpServerDefinitionProvider?.refresh();
        }

        isMcpEnabledPrev = isMcpEnabledCur;
        isMcpDocsEnabledPrev = isMcpDocsEnabledCur;
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
  private async initializeMcpServer(): Promise<void> {
    // If server is already running, stop it
    if (this._mcpServer != null) {
      this._mcpServer.stop();
      this._mcpServer = null;

      logger.info('MCP Server stopped.');
      vscode.window.showInformationMessage('Deephaven MCP Server stopped.');
    }

    // Clean up existing provider if present
    if (this._mcpServerDefinitionProvider != null) {
      this._mcpServerDefinitionProvider.dispose();
      this._mcpServerDefinitionProvider = null;
    }

    if (!this._config.isMcpEnabled()) {
      // Update status bar to show disabled state
      this.updateStatusBar(null);
      return;
    }

    try {
      // Create and start MCP server
      this._mcpServer = new McpServer(
        this._pythonDiagnostics,
        this._pythonWorkspace,
        this._serverManager,
        this._outputChannel,
        this._outputChannelDebug,
        this._panelService
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
        this._mcpVersion,
        this._mcpServer,
        this._config
      );
      this.disposables.push(this._mcpServerDefinitionProvider);

      this.disposables.push(
        vscode.lm.registerMcpServerDefinitionProvider(
          MCP_SERVER_KEY,
          this._mcpServerDefinitionProvider
        )
      );
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

    this._mcpStatusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      200
    );

    this._mcpStatusBarItem.command = SHOW_MCP_QUICK_PICK_CMD;
    this.disposables.push(this._mcpStatusBarItem);
  }

  /**
   * Copy the MCP server URL to clipboard.
   */
  private async copyUrl(): Promise<void> {
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
  private async maybeUpdateWindsurfMcpConfig(): Promise<void> {
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
   * Show quick pick menu for MCP server management.
   */
  private async showMcpQuickPick(): Promise<void> {
    const port = this._mcpServer?.getPort();
    const isMcpEnabled = this._config.isMcpEnabled();

    const items: McpQuickPickItem[] = [];

    // Always show enable or disable based on current state
    if (isMcpEnabled) {
      items.push({
        label: '$(circle-slash) Disable Deephaven MCP Server',
        action: 'disable',
      });
    } else {
      items.push({
        label: '$(circle-large-filled) Enable Deephaven MCP Server',
        action: 'enable',
      });
    }

    // If server is running, also show copy URL option
    if (port != null) {
      items.push({
        label: '$(copy) Copy Server URL',
        description: `http://localhost:${port}/mcp`,
        action: 'copy',
      });
    }

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select MCP server action',
    });

    if (selected == null) {
      return;
    }

    switch (selected.action) {
      case 'enable':
        await this._config.toggleMcp(true);
        break;
      case 'disable':
        await this._config.toggleMcp(false);
        break;
      case 'copy':
        await this.copyUrl();
        break;
    }
  }

  /**
   * Update MCP status bar with current port.
   * @param port The port the MCP server is running on, or null if not running
   */
  private updateStatusBar(port: number | null): void {
    if (this._mcpStatusBarItem == null) {
      return;
    }

    this._mcpStatusBarItem.text = `$(dh-ext-logo) MCP: ${port ?? 'Disabled'}`;
    this._mcpStatusBarItem.tooltip = `Deephaven MCP server is ${
      port == null ? 'disabled' : `running on port ${port}`
    }. Click to manage.`;

    this._mcpStatusBarItem.show();
  }
}
