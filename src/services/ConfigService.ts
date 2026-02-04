import * as vscode from 'vscode';
import { CONFIG_KEY, MCP_SERVER_NAME } from '../common';
import { isWindsurf, Logger } from '../util';
import type {
  CoreConnectionConfig,
  CoreConnectionConfigStored,
  EnterpriseConnectionConfig,
  EnterpriseConnectionConfigStored,
  IConfigService,
} from '../types';

const logger = new Logger('Config');

function getConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(CONFIG_KEY.root);
}

function isElectronFetchEnabled(): boolean {
  return vscode.workspace.getConfiguration().get('http.electronFetch') === true;
}

function getCoreServers(): CoreConnectionConfig[] {
  const config = getConfig().get<CoreConnectionConfigStored[]>(
    CONFIG_KEY.coreServers,
    []
  );

  // Expand each server config to a full `ConnectionConfig` object.
  const expandedConfig = config.map(server =>
    typeof server === 'string' ? { url: server } : server
  );

  logger.info('Core servers:', JSON.stringify(expandedConfig));

  return expandedConfig
    .filter(hasValidURL)
    .map(server => ({ ...server, url: new URL(server.url) }));
}

function getEnterpriseServers(): EnterpriseConnectionConfig[] {
  const config = getConfig().get<EnterpriseConnectionConfigStored[]>(
    CONFIG_KEY.enterpriseServers,
    []
  );

  // Expand each server config to a full `ConnectionConfig` object.
  const expandedConfig = config.map(server =>
    typeof server === 'string' ? { url: server } : server
  );

  logger.info('Enterprise servers:', JSON.stringify(expandedConfig));

  return expandedConfig
    .filter(hasValidURL)
    .map(server => ({ ...server, url: new URL(server.url) }));
}

/**
 * Attempt to parse a `url` string prop into a `URL` object.
 * @param objectWithUrl An object with a `url` string prop.
 * @returns `true` if the `url` prop is a valid URL, `false` otherwise.
 */
function hasValidURL({ url }: { url: string }): boolean {
  try {
    new URL(url);
    return true;
  } catch (err) {
    logger.error(err, url);
    return false;
  }
}

async function toggleMcp(enable?: boolean): Promise<void> {
  const currentState = isMcpEnabled();
  const targetState = enable ?? !currentState;

  if (currentState === targetState) {
    return;
  }

  await getConfig().update(
    CONFIG_KEY.mcpEnabled,
    targetState,
    false // workspace scope
  );
}

function getMcpAutoUpdateConfig(): boolean {
  return getConfig().get<boolean>(CONFIG_KEY.mcpAutoUpdateConfig, false);
}

function isMcpEnabled(): boolean {
  return getConfig().get<boolean>(CONFIG_KEY.mcpEnabled, false);
}

async function setMcpAutoUpdateConfig(value: boolean): Promise<void> {
  await getConfig().update(
    CONFIG_KEY.mcpAutoUpdateConfig,
    value,
    true // global scope
  );
}

/**
 * Update Windsurf MCP config with the Deephaven server entry.
 * @param port The port the MCP server is running on
 * @returns true if the config was updated, false otherwise
 */
export async function updateWindsurfMcpConfig(port: number): Promise<boolean> {
  if (!isWindsurf()) {
    return false;
  }

  const mcpUrl = `http://localhost:${port}/mcp`;
  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '';
  const windsurfMcpConfigPath = `${homeDir}/.codeium/windsurf/mcp_config.json`;
  const configUri = vscode.Uri.file(windsurfMcpConfigPath);

  try {
    // Read existing config or create new one
    let config: { mcpServers?: Record<string, { serverUrl?: string }> } = {
      mcpServers: {},
    };
    try {
      const existingContent = await vscode.workspace.fs.readFile(configUri);
      config = JSON.parse(existingContent.toString());
      if (config.mcpServers == null) {
        config.mcpServers = {};
      }
    } catch {
      // File doesn't exist or is invalid - start fresh
    }

    // Check if config already has the correct entry
    const existingEntry = config.mcpServers![MCP_SERVER_NAME];
    if (existingEntry?.serverUrl === mcpUrl) {
      // Config is already up to date
      return false;
    }

    // Check if user has enabled auto-update in settings
    const autoUpdate = getMcpAutoUpdateConfig();

    if (!autoUpdate) {
      let message: string;
      let buttons: string[];

      if (existingEntry == null) {
        message = `Add '${MCP_SERVER_NAME}' to your Windsurf MCP config?`;
        buttons = ['Yes', 'No'];
      } else {
        message = `Your Windsurf MCP config doesn't match this workspace's '${MCP_SERVER_NAME}'. Update to port ${port}?`;
        buttons = ['Yes', 'Always', 'No'];
      }

      const response = await vscode.window.showInformationMessage(
        message,
        ...buttons
      );

      if (response === 'Always') {
        // Store the preference to auto-update in the future
        await setMcpAutoUpdateConfig(true);
      } else if (response !== 'Yes') {
        return false;
      }

      await vscode.window.showTextDocument(configUri);
    }

    // Add/update the Deephaven MCP server entry
    config.mcpServers![MCP_SERVER_NAME] = {
      serverUrl: mcpUrl,
    };

    // Ensure parent directory exists
    const configDir = vscode.Uri.file(`${homeDir}/.codeium/windsurf`);
    try {
      await vscode.workspace.fs.createDirectory(configDir);
    } catch {
      // Directory may already exist
    }

    // Write updated config
    await vscode.workspace.fs.writeFile(
      configUri,
      Buffer.from(JSON.stringify(config, null, 2))
    );

    return true;
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to update Windsurf MCP config: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const ConfigService: IConfigService = {
  getCoreServers,
  getEnterpriseServers,
  isElectronFetchEnabled,
  isMcpEnabled,
  getMcpAutoUpdateConfig,
  setMcpAutoUpdateConfig,
  toggleMcp,
  updateWindsurfMcpConfig,
};
