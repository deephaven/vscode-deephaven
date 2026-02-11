import * as vscode from 'vscode';
import { CONFIG_KEY, MCP_SERVER_NAME } from '../common';
import {
  isWindsurf,
  Logger,
  updateWindsurfDocsMcpServerConfig,
  updateWindsurfMcpServerConfig,
} from '../util';
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

function isMcpDocsEnabled(): boolean {
  return getConfig().get<boolean>(CONFIG_KEY.mcpDocsEnabled, true);
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
  const configDir = vscode.Uri.file(`${homeDir}/.codeium/windsurf`);
  const configUri = vscode.Uri.joinPath(configDir, 'mcp_config.json');

  try {
    // Ensure MCP config file exists
    try {
      await vscode.workspace.fs.stat(configUri);
    } catch {
      // File doesn't exist - create it with empty structure
      await vscode.workspace.fs.createDirectory(configDir);
      await vscode.workspace.fs.writeFile(
        configUri,
        Buffer.from(JSON.stringify({}, null, 2))
      );
    }

    // Load config file content
    const existingContent = await vscode.workspace.fs.readFile(configUri);
    const config: { mcpServers?: Record<string, { serverUrl?: string }> } =
      JSON.parse(existingContent.toString());

    const mcpEnabled = isMcpEnabled();

    // Get updated mcpServers object (or same reference if no changes)
    let updatedMcpServers = updateWindsurfMcpServerConfig(
      config.mcpServers,
      mcpUrl,
      mcpEnabled
    );

    updatedMcpServers = updateWindsurfDocsMcpServerConfig(
      updatedMcpServers,
      mcpEnabled && isMcpDocsEnabled()
    );

    // If same reference, no changes needed - bail
    if (updatedMcpServers === config.mcpServers) {
      return false;
    }

    // Check autoUpdate logic and prompt if needed
    const autoUpdate = getMcpAutoUpdateConfig();

    if (!autoUpdate) {
      const isAdding = config.mcpServers?.[MCP_SERVER_NAME] == null;
      const action = isAdding ? 'Add' : 'Update';
      const message = `${action} Deephaven MCP servers ${isAdding ? 'to' : 'in'} your Windsurf MCP config?`;
      const buttons = isAdding ? ['Yes', 'No'] : ['Yes', 'Always', 'No'];

      const response = await vscode.window.showInformationMessage(
        message,
        ...buttons
      );

      if (response === 'Always') {
        await setMcpAutoUpdateConfig(true);
      } else if (response !== 'Yes') {
        return false;
      }

      await vscode.window.showTextDocument(configUri);
    }

    // Set config.mcpServers to new reference and write
    config.mcpServers = updatedMcpServers;

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
  isMcpDocsEnabled,
  isMcpEnabled,
  getMcpAutoUpdateConfig,
  setMcpAutoUpdateConfig,
  toggleMcp,
  updateWindsurfMcpConfig,
};
