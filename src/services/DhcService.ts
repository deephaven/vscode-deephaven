import * as vscode from 'vscode';
import type { dh as DhcType } from '../dh/dhc-types';
import DhService from './DhService';
import {
  AUTH_HANDLER_TYPE_ANONYMOUS,
  AUTH_HANDLER_TYPE_PSK,
  getEmbedWidgetUrl,
  initDhcApi,
  initDhcSession,
} from '../dh/dhc';
import { getPanelHtml } from '../util';
import { ConnectionAndSession } from '../common';

export class DhcService extends DhService<typeof DhcType, DhcType.CoreClient> {
  private psk?: string;

  protected async initApi() {
    return initDhcApi(this.serverUrl);
  }

  protected async createClient(
    dh: typeof DhcType
  ): Promise<DhcType.CoreClient> {
    try {
      return new dh.CoreClient(this.serverUrl);
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  protected async createSession(
    dh: typeof DhcType,
    client: DhcType.CoreClient
  ) {
    let connectionAndSession: ConnectionAndSession<
      DhcType.IdeConnection,
      DhcType.IdeSession
    > | null = null;

    try {
      const authConfig = new Set(
        (await client.getAuthConfigValues()).map(([, value]) => value)
      );

      if (authConfig.has(AUTH_HANDLER_TYPE_ANONYMOUS)) {
        connectionAndSession = await initDhcSession(client, {
          type: dh.CoreClient.LOGIN_TYPE_ANONYMOUS,
        });
      } else if (authConfig.has(AUTH_HANDLER_TYPE_PSK)) {
        const token = await vscode.window.showInputBox({
          placeHolder: 'Pre-Shared Key',
          prompt: 'Enter your Deephaven pre-shared key',
          password: true,
        });

        connectionAndSession = await initDhcSession(client, {
          type: 'io.deephaven.authentication.psk.PskAuthenticationHandler',
          token,
        });

        this.psk = token;
      }
    } catch (err) {
      console.error(err);
    }

    return connectionAndSession;
  }

  protected getPanelHtml(title: string): string {
    const iframeUrl = getEmbedWidgetUrl(this.serverUrl, title, this.psk);
    return getPanelHtml(iframeUrl, title);
  }

  protected handlePanelMessage(): Promise<void> {
    throw new Error('Method not implemented.');
  }
}

export default DhcService;
