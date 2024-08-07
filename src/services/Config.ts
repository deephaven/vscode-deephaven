import * as vscode from 'vscode';
import {
  CONFIG_CORE_SERVERS,
  CONFIG_KEY,
  ConnectionConfig,
  ConnectionConfigStored,
  DEFAULT_CONSOLE_TYPE,
  SERVER_LANGUAGE_SET,
} from '../common';
import { InvalidConsoleTypeError, Logger } from '../util';

const logger = new Logger('Config');

function getConfig() {
  return vscode.workspace.getConfiguration(CONFIG_KEY);
}

function getCoreServers(): ConnectionConfig[] {
  const config = getConfig().get<ConnectionConfigStored[]>(
    CONFIG_CORE_SERVERS,
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

// eslint-disable-next-line @typescript-eslint/naming-convention
export const Config = {
  getCoreServers,
};
