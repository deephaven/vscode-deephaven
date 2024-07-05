import * as vscode from 'vscode';
import { CacheService } from './CacheService';
import { DhcService } from './DhcService';
import { ensureHasTrailingSlash } from '../util';

export class DhServiceRegistry<T extends DhcService> extends CacheService<
  T,
  'disconnect'
> {
  constructor(
    serviceFactory: new (
      serverUrl: string,
      outputChannel: vscode.OutputChannel
    ) => T,
    outputChannel: vscode.OutputChannel
  ) {
    super(
      serviceFactory.name,
      async serverUrl => {
        if (serverUrl == null) {
          throw new Error(`${serviceFactory.name} server url is null.`);
        }

        const dhService = new serviceFactory(serverUrl, outputChannel);

        dhService.addEventListener('disconnect', () => {
          this.dispatchEvent('disconnect');
        });

        return dhService;
      },
      ensureHasTrailingSlash
    );
  }
}
