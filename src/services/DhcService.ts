import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { initDhcApi } from '@deephaven/require-jsapi';
import DhService from './DhService';
import { getTempDir, Logger, urlToDirectoryName } from '../util';
import {
  AUTH_HANDLER_TYPE_ANONYMOUS,
  AUTH_HANDLER_TYPE_PSK,
  initDhcSession,
  type ConnectionAndSession,
} from '../dh/dhc';

const logger = new Logger('DhcService');

export class DhcService extends DhService<typeof DhcType, DhcType.CoreClient> {
  async getPsk(): Promise<string | null> {
    const credentials = await this.coreCredentialsCache.get(this.serverUrl)?.();

    if (credentials?.type !== AUTH_HANDLER_TYPE_PSK) {
      return null;
    }

    return credentials.token ?? null;
  }

  protected async initApi(): Promise<typeof DhcType> {
    return initDhcApi(
      this.serverUrl,
      getTempDir({ subDirectory: urlToDirectoryName(this.serverUrl) })
    );
  }

  protected async createClient(
    dh: typeof DhcType
  ): Promise<DhcType.CoreClient> {
    try {
      return new dh.CoreClient(this.serverUrl.toString());
    } catch (err) {
      logger.error(err);
      throw err;
    }
  }

  protected async createSession(
    dh: typeof DhcType,
    client: DhcType.CoreClient
  ): Promise<ConnectionAndSession<DhcType.IdeConnection, DhcType.IdeSession>> {
    if (!this.coreCredentialsCache.has(this.serverUrl)) {
      const authConfig = new Set(
        (await client.getAuthConfigValues()).map(([, value]) => value)
      );

      if (authConfig.has(AUTH_HANDLER_TYPE_ANONYMOUS)) {
        this.coreCredentialsCache.set(this.serverUrl, async () => ({
          type: dh.CoreClient.LOGIN_TYPE_ANONYMOUS,
        }));
      } else if (authConfig.has(AUTH_HANDLER_TYPE_PSK)) {
        this.coreCredentialsCache.set(this.serverUrl, async () => ({
          type: AUTH_HANDLER_TYPE_PSK,
          token: await vscode.window.showInputBox({
            placeHolder: 'Pre-Shared Key',
            prompt: 'Enter your Deephaven pre-shared key',
            password: true,
          }),
        }));
      }
    }

    if (this.coreCredentialsCache.has(this.serverUrl)) {
      const credentials = await this.coreCredentialsCache.get(
        this.serverUrl
      )!();
      return initDhcSession(client, credentials);
    }

    throw new Error('No supported authentication methods found.');
  }
}

export default DhcService;
