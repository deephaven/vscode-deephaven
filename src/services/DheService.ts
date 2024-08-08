import { dh } from '@deephaven/jsapi-types';
import { ConnectionAndSession } from '../common';
import { EnterpriseDhType as DheType, EnterpriseClient } from '../dh/dhe-types';
import DhService from './DhService';
import { getWsUrl, initDheApi } from '../dh/dhe';
import { Logger } from '../util';

const logger = new Logger('DhcService');

export class DheService extends DhService<DheType, EnterpriseClient> {
  protected initApi(): Promise<DheType> {
    return initDheApi(this.serverUrl);
  }

  protected async createClient(dhe: DheType): Promise<EnterpriseClient> {
    try {
      const wsUrl = getWsUrl(this.serverUrl);
      const client = new dhe.Client(wsUrl);

      await new Promise(resolve =>
        this.subscriptions.push(
          client.addEventListener(dhe.Client.EVENT_CONNECT, resolve)
        )
      );

      return client;
    } catch (err) {
      logger.error(err);
      throw err;
    }
  }

  protected createSession(
    dhe: DheType,
    client: EnterpriseClient
  ): Promise<ConnectionAndSession<dh.IdeConnection, dh.IdeSession>> {
    throw new Error('Method not implemented.');
  }

  protected getPanelHtml(title: string): string {
    throw new Error('Method not implemented.');
  }

  protected handlePanelMessage(
    message: { id: string; message: string },
    postResponseMessage: (response: unknown) => void
  ): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
