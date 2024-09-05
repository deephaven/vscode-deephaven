import * as vscode from 'vscode';
import { ExtendedMap } from '../util';
import { DhcService } from './DhcService';
import type { IDhServiceFactory, IToastService } from '../types';

/**
 * Factory for creating DhcService instances.
 */
export class DhcServiceFactory implements IDhServiceFactory {
  constructor(
    private panelRegistry: ExtendedMap<string, vscode.WebviewPanel>,
    private diagnosticsCollection: vscode.DiagnosticCollection,
    private outputChannel: vscode.OutputChannel,
    private toaster: IToastService
  ) {}

  create = (serverUrl: URL, psk?: string): DhcService => {
    const dhService = new DhcService(
      serverUrl,
      this.panelRegistry,
      this.diagnosticsCollection,
      this.outputChannel,
      this.toaster
    );

    if (psk != null) {
      dhService.setPsk(psk);
    }

    return dhService;
  };
}
