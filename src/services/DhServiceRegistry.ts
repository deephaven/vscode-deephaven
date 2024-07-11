import * as vscode from 'vscode';
import { CacheService } from './CacheService';
import { DhcService, DhcServiceConstructor } from './DhcService';
import { ensureHasTrailingSlash, ExtendedMap } from '../util';

export class DhServiceRegistry<T extends DhcService> extends CacheService<
  T,
  'disconnect'
> {
  constructor(
    serviceFactory: DhcServiceConstructor<T>,
    panelRegistry: ExtendedMap<string, vscode.WebviewPanel>,
    outputChannel: vscode.OutputChannel
  ) {
    super(
      serviceFactory.name,
      async serverUrl => {
        if (serverUrl == null) {
          throw new Error(`${serviceFactory.name} server url is null.`);
        }

        const dhService = new serviceFactory(
          serverUrl,
          panelRegistry,
          outputChannel
        );

        // Propagate service events as registry events.
        dhService.addEventListener('disconnect', event => {
          this.dispatchEvent('disconnect', event);
        });

        return dhService;
      },
      ensureHasTrailingSlash
    );
  }
}
