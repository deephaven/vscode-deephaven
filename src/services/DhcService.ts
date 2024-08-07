import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import DhService from './DhService';
import {
  AUTH_HANDLER_TYPE_ANONYMOUS,
  AUTH_HANDLER_TYPE_PSK,
  getEmbedWidgetUrl,
  initDhcApi,
  initDhcSession,
} from '../dh/dhc';
import { getPanelHtml, Logger } from '../util';
import { ConnectionAndSession } from '../common';

const logger = new Logger('DhcService');

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
      const token = await vscode.window.showInputBox({
        placeHolder: 'Pre-Shared Key',
        prompt: 'Enter your Deephaven pre-shared key',
        password: true,
      });

      const connectionAndSession = await initDhcSession(client, {
        type: 'io.deephaven.authentication.psk.PskAuthenticationHandler',
        token,
      });

      this.psk = token;

      return connectionAndSession;
    }

    throw new Error('No supported authentication methods found.');
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
