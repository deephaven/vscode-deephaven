import * as vscode from 'vscode';
import {
  CONFIG_KEY,
  CoreConnectionConfig,
  CoreConnectionConfigStored,
  DEFAULT_CONSOLE_TYPE,
  EnterpriseConnectionConfig,
  EnterpriseConnectionConfigStored,
  SERVER_LANGUAGE_SET,
} from '../common';
import { InvalidConsoleTypeError, Logger } from '../util';
import type { IConfigService } from './types';

const logger = new Logger('Config');

function getConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(CONFIG_KEY.root);
}

function getCoreServers(): CoreConnectionConfig[] {
  const config = getConfig().get<CoreConnectionConfigStored[]>(
    CONFIG_KEY.coreServers,
    []
  );

  // Expand each server config to a full `ConnectionConfig` object.
  const expandedConfig = config.map(server =>
    typeof server === 'string'
      ? { consoleType: DEFAULT_CONSOLE_TYPE, url: server }
      : {
          consoleType: DEFAULT_CONSOLE_TYPE,
          ...server,
        }
  );

  logger.info('Core servers:', JSON.stringify(expandedConfig));

  return expandedConfig.filter(server => {
    try {
      // Filter out any invalid server configs to avoid crashing the extension
      // further upstream.
      new URL(server.url);
      if (!SERVER_LANGUAGE_SET.has(server.consoleType)) {
        throw new InvalidConsoleTypeError(server.consoleType);
      }
      return true;
    } catch (err) {
      logger.error(err, server.url);
      return false;
    }
  });
}

function getEnterpriseServers(): EnterpriseConnectionConfig[] {
  const config = getConfig().get<EnterpriseConnectionConfigStored[]>(
    CONFIG_KEY.enterpriseServers,
    []
  );

  const expandedConfig = config.map(url => ({ url }));

  logger.info('Enterprise servers:', JSON.stringify(expandedConfig));

  return expandedConfig.filter(server => {
    try {
      // Filter out any invalid server configs to avoid crashing the extension
      // further upstream.
      new URL(server.url);
      return true;
    } catch (err) {
      logger.error(err, server.url);
      return false;
    }
  });
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const ConfigService: IConfigService = {
  getCoreServers,
  getEnterpriseServers,
};
