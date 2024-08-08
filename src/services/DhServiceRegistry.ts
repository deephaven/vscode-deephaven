import * as vscode from 'vscode';
import { CacheService } from './CacheService';
import { type DhServiceConstructor } from './DhService';
import { DhcService } from './DhcService';
import { ensureHasTrailingSlash, ExtendedMap, Toaster } from '../util';

export class DhServiceRegistry<T extends DhcService> extends CacheService<
  T,
  'disconnect'
> {
  constructor(
    serviceFactory: DhServiceConstructor<T>,
    panelRegistry: ExtendedMap<
      string,
      ExtendedMap<string, vscode.WebviewPanel>
    >,
    diagnosticsCollection: vscode.DiagnosticCollection,
    outputChannel: vscode.OutputChannel,
    toaster: Toaster
  ) {
    super(
      serviceFactory.name,
      async serverUrl => {
        if (serverUrl == null) {
          throw new Error(`${serviceFactory.name} server url is null.`);
        }

        // Get or add the panel registry for the server if it doesn't exist.
        if (!panelRegistry.has(serverUrl)) {
          panelRegistry.set(serverUrl, new ExtendedMap());
        }
        const serverPanelRegistry = panelRegistry.getOrThrow(serverUrl);

        const dhService = new serviceFactory(
          serverUrl,
          serverPanelRegistry,
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
