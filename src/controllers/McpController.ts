import * as vscode from 'vscode';
import * as fs from 'node:fs';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { ControllerBase } from './ControllerBase';
import { McpServer } from '../mcp';
import { McpServerDefinitionProvider } from '../providers';
import type {
  IAsyncCacheService,
  IConfigService,
  IPanelService,
  IServerManager,
  McpVersion,
  GroovyPackageName,
  PythonModuleFullname,
} from '../types';
import type { FilteredWorkspace } from '../services';
import {
  isWindsurf,
  Logger,
  hasClaudeMcpServer,
  OutputChannelWithHistory,
  registerClaudeMcpServers,
  resolveClaudeCliPath,
  unregisterClaudeMcpServers,
} from '../util';
import {
  CLAUDE_EXTENSION_ID,
  CLAUDE_MCP_DOCS_SERVER_NAME,
  CLAUDE_MCP_PORT_ENV_VAR,
  CLAUDE_MCP_REGISTERED_FOLDERS_STORAGE_KEY,
  CLAUDE_MCP_SERVER_NAME,
  COPY_MCP_URL_CMD,
  MCP_SERVER_KEY,
  MCP_SERVER_NAME,
  MCP_SERVER_PORT_STORAGE_KEY,
  SHOW_MCP_QUICK_PICK_CMD,
  TOGGLE_MCP_CMD,
} from '../common';

const logger = new Logger('McpController');

const CLAUDE_MCP_FOCUS_CHECK_THROTTLE_MS = 10000;

interface McpQuickPickItem extends vscode.QuickPickItem {
  action: 'enable' | 'disable' | 'copy';
}

/**
 * Controller for managing the MCP (Model Context Protocol) server.
 * Handles server lifecycle, status bar updates, and configuration.
 */
export class McpController extends ControllerBase {
  private _mcpServer: McpServer | null = null;
  private _mcpServerDefinitionProvider: McpServerDefinitionProvider | null =
    null;
  private _mcpStatusBarItem: vscode.StatusBarItem | null = null;
  private _claudeCliPath: string | null = null;
  private _claudeMcpConfigQueue: Promise<void> = Promise.resolve();
  private _claudeMcpFocusCheckLastMs = 0;

  constructor(
    private readonly _config: IConfigService,
    private readonly _context: vscode.ExtensionContext,
    private readonly _coreJsApiCache: IAsyncCacheService<URL, typeof DhcType>,
    private readonly _mcpVersion: McpVersion,
    private readonly _outputChannel: OutputChannelWithHistory,
    private readonly _outputChannelDebug: OutputChannelWithHistory,
    private readonly _panelService: IPanelService,
    private readonly _groovyDiagnostics: vscode.DiagnosticCollection,
    private readonly _groovyWorkspace: FilteredWorkspace<GroovyPackageName>,
    private readonly _pythonDiagnostics: vscode.DiagnosticCollection,
    private readonly _pythonWorkspace: FilteredWorkspace<PythonModuleFullname>,
    private readonly _serverManager: IServerManager
  ) {
    super();

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

          // This will also refresh the provider, so no need to call refresh separately
          this.initializeMcpServer();
        }
        // Refresh provider if only docs enabled state changed
        else if (isMcpDocsEnabledCur !== isMcpDocsEnabledPrev) {
          this._mcpServerDefinitionProvider?.refresh();
          this._config.updateWindsurfMcpConfig(
            this._mcpServer?.getPort() ?? null
          );
          this.syncClaudeMcpConfig();
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

    // Restore Claude MCP config removed by another window sharing the same
    // Claude project (e.g. a sibling git worktree that disabled MCP)
    vscode.window.onDidChangeWindowState(
      () => this.maybeRestoreClaudeMcpConfig(),
      null,
      this.disposables
    );

    // Register MCP servers for Claude in added workspace folders, and remove
    // them from removed folders
    vscode.workspace.onDidChangeWorkspaceFolders(
      () => this.syncClaudeMcpConfig(),
      null,
      this.disposables
    );

    this._context.environmentVariableCollection.description =
      'Deephaven MCP server port for Claude Code';

    this.initializeStatusBar();
    this.initializeDefinitionProvider();
    this.initializeMcpServer();
  }

  /**
   * Initialize the MCP server definition provider for VS Code.
   * This should be called once during controller construction.
   */
  private initializeDefinitionProvider(): void {
    // Only register provider in VS Code (not Windsurf)
    if (isWindsurf()) {
      return;
    }

    this._mcpServerDefinitionProvider = new McpServerDefinitionProvider(
      this._mcpVersion,
      this._config
    );
    this.disposables.push(this._mcpServerDefinitionProvider);

    this.disposables.push(
      vscode.lm.registerMcpServerDefinitionProvider(
        MCP_SERVER_KEY,
        this._mcpServerDefinitionProvider
      )
    );
  }

  /**
   * Initialize and start the MCP server if enabled.
   */
  private async initializeMcpServer(): Promise<void> {
    this.setClaudeMcpPortEnvVar(null);

    // If server is already running, stop it
    if (this._mcpServer != null) {
      this._mcpServer.stop();
      this._mcpServer = null;
      this._mcpServerDefinitionProvider?.setMcpServer(null);

      logger.info('MCP Server stopped.');
      vscode.window.showInformationMessage('Deephaven MCP Server stopped.');
    }

    if (!this._config.isMcpEnabled()) {
      // Update status bar to show disabled state
      this.updateStatusBar(null);
      await this._config.updateWindsurfMcpConfig(null);
      this._mcpServerDefinitionProvider?.refresh();
      this.syncClaudeMcpConfig();
      return;
    }

    try {
      // Create and start MCP server
      this._mcpServer = new McpServer(
        this._coreJsApiCache,
        this._outputChannel,
        this._outputChannelDebug,
        this._panelService,
        this._groovyDiagnostics,
        this._groovyWorkspace,
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

      // Configure Claude Code in all editors (VS Code, Windsurf, Cursor, etc.),
      // since it doesn't use editor MCP APIs. Must run before the Windsurf early
      // return below.
      this.setClaudeMcpPortEnvVar(actualPort);
      this.syncClaudeMcpConfig();

      // Auto-configure Windsurf MCP config if running in Windsurf
      if (isWindsurf()) {
        await this._config.updateWindsurfMcpConfig(actualPort);

        // Windsurf doesn't support registering MCP servers via `vscode.lm,` so we're done
        return;
      }

      // Update provider with new server reference and refresh
      this._mcpServerDefinitionProvider?.setMcpServer(this._mcpServer);
      this._mcpServerDefinitionProvider?.refresh();
    } catch (error) {
      // Don't fail extension activation if MCP server fails
      logger.error('Failed to initialize MCP server:', error);
      vscode.window.showErrorMessage(
        `Failed to initialize MCP server: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Set the environment variable Claude uses to expand the port in the
   * `deephaven-vscode` MCP server URL. Claude local scope config is shared by
   * all git worktrees of a repo, so the URL can't contain the port itself.
   * Instead, each window provides its own port to the Claude processes it
   * starts: `process.env` is inherited by the Claude VS Code extension, and the
   * environment variable collection is applied to integrated terminals. Child
   * processes of other extensions in this extension host inherit it too, which
   * is harmless since the variable is specific to this extension.
   * @param port The MCP server port, or null to remove the variable
   */
  private setClaudeMcpPortEnvVar(port: number | null): void {
    const collection = this._context.environmentVariableCollection;

    if (port == null) {
      delete process.env[CLAUDE_MCP_PORT_ENV_VAR];
      collection.delete(CLAUDE_MCP_PORT_ENV_VAR);
      return;
    }

    process.env[CLAUDE_MCP_PORT_ENV_VAR] = String(port);
    collection.replace(CLAUDE_MCP_PORT_ENV_VAR, String(port));
  }

  /**
   * Queue a Claude MCP config task so this window's tasks run in the order
   * they were requested (e.g. rapid enable / disable toggles).
   * @param task The task to run
   */
  private queueClaudeMcpConfigTask(task: () => Promise<void>): void {
    this._claudeMcpConfigQueue = this._claudeMcpConfigQueue
      .then(task)
      .catch(error => {
        logger.error('Failed to sync Claude MCP config:', error);
      });
  }

  /**
   * Get the path to the Claude CLI. Only a found CLI is cached so a CLI
   * installed after activation is picked up later. Only call from a queued
   * task so resolution never runs concurrently.
   * @returns The Claude CLI path, or null if not installed
   */
  private async getClaudeCliPath(): Promise<string | null> {
    this._claudeCliPath ??= await resolveClaudeCliPath(
      vscode.extensions.getExtension(CLAUDE_EXTENSION_ID)?.extensionPath
    );

    if (this._claudeCliPath == null) {
      logger.debug('Claude CLI not found. Skipping Claude MCP config.');
    }

    return this._claudeCliPath;
  }

  /**
   * Get the paths of workspace folders that this workspace registered Claude
   * MCP servers for and hasn't removed them from yet.
   */
  private getClaudeMcpRegisteredFolders(): string[] {
    return (
      this._context.workspaceState.get<string[]>(
        CLAUDE_MCP_REGISTERED_FOLDERS_STORAGE_KEY
      ) ?? []
    );
  }

  /**
   * Set the paths of workspace folders that this workspace registered Claude
   * MCP servers for.
   * @param folderPaths The folder paths
   */
  private async setClaudeMcpRegisteredFolders(
    folderPaths: Iterable<string>
  ): Promise<void> {
    await this._context.workspaceState.update(
      CLAUDE_MCP_REGISTERED_FOLDERS_STORAGE_KEY,
      [...new Set(folderPaths)]
    );
  }

  /**
   * Sync Deephaven MCP servers in Claude `local` scope config with the current
   * MCP enabled state and workspace folders. `local` scope config is stored in
   * `~/.claude.json` under `projects["<path>"].mcpServers`, where `<path>` is
   * the git root of the folder (the main repo root for git worktrees), or the
   * folder itself if it is not in a git repo.
   *
   * Registered folders are persisted so removals can be retried. A removal can
   * fail or never finish (e.g. VS Code restarts the extension host when the
   * first folder of a multi-root workspace is removed), and by the next sync
   * the folder is no longer a workspace folder.
   *
   * 1. Remove servers from registered folders that are no longer workspace
   *    folders (all registered folders if MCP is disabled). This runs first so
   *    a remaining folder sharing a Claude project with a removed one ends up
   *    registered.
   * 2. Register servers for all workspace folders if MCP is enabled.
   *
   * Does nothing if the Claude CLI is not installed. State is read when a sync
   * runs rather than when it is queued.
   */
  private syncClaudeMcpConfig(): void {
    this.queueClaudeMcpConfigTask(async () => {
      const folderPaths = this._config.isMcpEnabled()
        ? getClaudeFolderPaths(vscode.workspace.workspaceFolders ?? [])
        : [];
      const registeredPaths = new Set(this.getClaudeMcpRegisteredFolders());
      const stalePaths = [...registeredPaths].filter(
        folderPath => !folderPaths.includes(folderPath)
      );

      // Avoid spawning the Claude CLI if there is nothing to do
      if (folderPaths.length === 0 && stalePaths.length === 0) {
        return;
      }

      const cliPath = await this.getClaudeCliPath();
      if (cliPath == null) {
        return;
      }

      // Record folders before registering so they are cleaned up later even
      // if registration is interrupted
      await this.setClaudeMcpRegisteredFolders([
        ...registeredPaths,
        ...folderPaths,
      ]);

      for (const folderPath of stalePaths) {
        // The Claude CLI can't run in a deleted folder, so its config can't be
        // removed. Stop tracking it.
        const isRemoved =
          !fs.existsSync(folderPath) ||
          (await unregisterClaudeMcpServers(cliPath, folderPath));

        // Keep tracking the folder if cleanup didn't complete so it is retried
        // on the next sync
        if (isRemoved) {
          registeredPaths.delete(folderPath);
          await this.setClaudeMcpRegisteredFolders([
            ...registeredPaths,
            ...folderPaths,
          ]);
        }
      }

      for (const folderPath of folderPaths) {
        await registerClaudeMcpServers(
          cliPath,
          folderPath,
          this._config.isMcpDocsEnabled()
        );
      }
    });
  }

  /**
   * Re-register Claude MCP servers when the window gains focus if any are
   * missing. Claude local scope config is shared by windows on the same Claude
   * project (e.g. git worktrees of the same repo), so another window disabling
   * MCP (or docs) removes the servers for this one too. Throttled since it
   * spawns the Claude CLI.
   */
  private maybeRestoreClaudeMcpConfig(): void {
    const folderPaths = getClaudeFolderPaths(
      vscode.workspace.workspaceFolders ?? []
    );

    if (
      !vscode.window.state.focused ||
      !this._config.isMcpEnabled() ||
      folderPaths.length === 0 ||
      Date.now() - this._claudeMcpFocusCheckLastMs <
        CLAUDE_MCP_FOCUS_CHECK_THROTTLE_MS
    ) {
      return;
    }

    this._claudeMcpFocusCheckLastMs = Date.now();

    this.queueClaudeMcpConfigTask(async () => {
      const cliPath = await this.getClaudeCliPath();
      if (cliPath == null) {
        return;
      }

      const names = this._config.isMcpDocsEnabled()
        ? [CLAUDE_MCP_SERVER_NAME, CLAUDE_MCP_DOCS_SERVER_NAME]
        : [CLAUDE_MCP_SERVER_NAME];

      for (const folderPath of folderPaths) {
        for (const name of names) {
          if (!(await hasClaudeMcpServer(cliPath, folderPath, name))) {
            logger.info(
              `Claude MCP server '${name}' is missing for ${folderPath}. Restoring.`
            );
            this.syncClaudeMcpConfig();
            return;
          }
        }
      }
    });
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

/**
 * Get the file system paths of the given workspace folders that the Claude CLI
 * can run in. The extension runs in the remote extension host for remote
 * workspaces (e.g. Dev Containers, Remote - SSH), where workspace folders have
 * the `vscode-remote` scheme and `fsPath` is a path on the remote machine.
 * @param folders Workspace folders
 * @returns File system paths of the folders
 */
function getClaudeFolderPaths(
  folders: readonly vscode.WorkspaceFolder[]
): string[] {
  const isRemote = vscode.env.remoteName != null;

  return folders
    .filter(
      ({ uri }) =>
        uri.scheme === 'file' || (isRemote && uri.scheme === 'vscode-remote')
    )
    .map(({ uri }) => uri.fsPath);
}
