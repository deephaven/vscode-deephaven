import * as vscode from 'vscode';
import { ExtendedMap } from '../util';
import { DhcService } from './DhcService';
import type { IDhServiceFactory, IToastService } from './types';

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

  create = (serverUrl: vscode.Uri): DhcService => {
    return new DhcService(
      serverUrl,
      this.panelRegistry,
      this.diagnosticsCollection,
      this.outputChannel,
      this.toaster
    );
  };
}
