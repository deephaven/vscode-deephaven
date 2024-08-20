import * as vscode from 'vscode';
import { CacheService } from './CacheService';
import { type DhServiceConstructor } from './DhService';
import { type IDhService, IToastService } from './types';
import { ensureHasTrailingSlash, ExtendedMap } from '../util';

export class DhServiceRegistry<T extends IDhService> extends CacheService<
  T,
  'disconnect'
> {
  constructor(
    serviceFactory: DhServiceConstructor<T>,
    panelRegistry: ExtendedMap<string, vscode.WebviewPanel>,
    diagnosticsCollection: vscode.DiagnosticCollection,
    outputChannel: vscode.OutputChannel,
    toaster: IToastService
  ) {
    super(
      serviceFactory.name,
      async serverUrl => {
        if (serverUrl == null) {
          throw new Error(`${serviceFactory.name} server url is null.`);
        }

        const dhService = new serviceFactory(
          vscode.Uri.parse(serverUrl),
          panelRegistry,
          diagnosticsCollection,
          outputChannel,
          toaster
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
