import * as vscode from 'vscode';
import { CONFIG_KEY, MCP_DOCS_SERVER_NAME, MCP_SERVER_NAME } from '../common';
import {
  deleteConfigKeys,
  getEnsuredContent,
  getWindsurfMcpConfigUri,
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

/**
 * Prompt user for MCP config update.
 * @param configUri The URI of the MCP config file
 * @param configExists Whether the config entry already exists (vs adding new)
 * @returns true if user approved the update, false otherwise
 */
async function promptForMcpConfigUpdate(
  configUri: vscode.Uri,
  configExists: boolean
): Promise<boolean> {
  const action = configExists ? 'Update' : 'Add';
  const message = `${action} Deephaven MCP servers ${configExists ? 'in' : 'to'} your Windsurf MCP config?`;
  const buttons = configExists ? ['Yes', 'Always', 'No'] : ['Yes', 'No'];

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
  return true;
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
 * @param port The port the MCP server is running on (or null to remove entry)
 * @returns true if the config was updated, false otherwise
 */
export async function updateWindsurfMcpConfig(
  port: number | null
): Promise<boolean> {
  if (!isWindsurf()) {
    return false;
  }

  const configUri = getWindsurfMcpConfigUri();

  try {
    // Ensure MCP config file exists and load content
    const existingContent = await getEnsuredContent(configUri, '{}\n');
    const config: { mcpServers?: Record<string, { serverUrl?: string }> } =
      JSON.parse(existingContent);

    let updatedMcpServers = config.mcpServers;

    // Helper to save the config file if changes were made
    const saveMcpConfigIfChanged = async (): Promise<boolean> => {
      if (updatedMcpServers === config.mcpServers) {
        return false;
      }

      // Set config.mcpServers to new reference and write
      config.mcpServers = updatedMcpServers;

      await vscode.workspace.fs.writeFile(
        configUri,
        Buffer.from(JSON.stringify(config, null, 2))
      );

      return true;
    };

    // Remove any configured mcp servers if MCP is disabled
    if (!isMcpEnabled()) {
      updatedMcpServers = deleteConfigKeys(config.mcpServers, [
        MCP_SERVER_NAME,
        MCP_DOCS_SERVER_NAME,
      ]);

      return await saveMcpConfigIfChanged();
    }

    if (port == null) {
      updatedMcpServers = deleteConfigKeys(config.mcpServers, [
        MCP_SERVER_NAME,
      ]);

      return await saveMcpConfigIfChanged();
    }

    // Add or update MCP server config with correct URL
    updatedMcpServers = updateWindsurfMcpServerConfig(
      config.mcpServers,
      `http://localhost:${port}/mcp`
    );

    // Add or remove docs server config based on mcp docs enabled state
    updatedMcpServers = isMcpDocsEnabled()
      ? updateWindsurfDocsMcpServerConfig(updatedMcpServers)
      : deleteConfigKeys(updatedMcpServers, [MCP_DOCS_SERVER_NAME]);

    // If config hasn't changed, no need to write or prompt user
    if (updatedMcpServers === config.mcpServers) {
      return false;
    }

    const configExists = config.mcpServers?.[MCP_SERVER_NAME] != null;

    // Should update if auto update enabled or user approves the update via prompt
    const shouldUpdate =
      getMcpAutoUpdateConfig() ||
      (await promptForMcpConfigUpdate(configUri, configExists));

    if (!shouldUpdate) {
      return false;
    }

    return await saveMcpConfigIfChanged();
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
