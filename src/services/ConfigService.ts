import * as vscode from 'vscode';
import { CONFIG_KEY } from '../common';
import { Logger } from '../util';
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

// eslint-disable-next-line @typescript-eslint/naming-convention
export const ConfigService: IConfigService = {
  getCoreServers,
  getEnterpriseServers,
  isElectronFetchEnabled,
};
