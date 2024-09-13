import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import {
  AUTH_HANDLER_TYPE_ANONYMOUS,
  AUTH_HANDLER_TYPE_PSK,
  ConnectionAndSession,
  initDhcApi,
  initDhcSession,
} from '@deephaven/require-jsapi';
import DhService from './DhService';
import { getTempDir, Logger, urlToDirectoryName } from '../util';

const logger = new Logger('DhcService');

export class DhcService extends DhService<typeof DhcType, DhcType.CoreClient> {
  private _psk?: string;

  getPsk(): string | undefined {
    return this._psk;
  }

  setPsk(psk: string): void {
    this._psk = psk;
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
    const authConfig = new Set(
      (await client.getAuthConfigValues()).map(([, value]) => value)
    );

    if (authConfig.has(AUTH_HANDLER_TYPE_ANONYMOUS)) {
      return initDhcSession(client, {
        type: dh.CoreClient.LOGIN_TYPE_ANONYMOUS,
      });
    } else if (authConfig.has(AUTH_HANDLER_TYPE_PSK)) {
      if (this._psk == null) {
        this._psk = await vscode.window.showInputBox({
          placeHolder: 'Pre-Shared Key',
          prompt: 'Enter your Deephaven pre-shared key',
          password: true,
        });
      }

      const connectionAndSession = await initDhcSession(client, {
        type: 'io.deephaven.authentication.psk.PskAuthenticationHandler',
        token: this._psk,
      });

      return connectionAndSession;
    }

    throw new Error('No supported authentication methods found.');
  }
}

export default DhcService;
