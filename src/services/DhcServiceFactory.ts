import * as vscode from 'vscode';
import { DhcService } from './DhcService';
import type { IDhServiceFactory, IPanelService, IToastService } from '../types';

/**
 * Factory for creating DhcService instances.
 */
export class DhcServiceFactory implements IDhServiceFactory {
  constructor(
    private panelService: IPanelService,
    private diagnosticsCollection: vscode.DiagnosticCollection,
    private outputChannel: vscode.OutputChannel,
    private toaster: IToastService
  ) {}

  dispose = async (): Promise<void> => {
    this._onCreated.dispose();
  };

  private _onCreated = new vscode.EventEmitter<DhcService>();
  readonly onCreated = this._onCreated.event;

  create = (serverUrl: URL, psk?: string): DhcService => {
    const dhService = new DhcService(
      serverUrl,
      this.panelService,
      this.diagnosticsCollection,
      this.outputChannel,
      this.toaster
    );

    if (psk != null) {
      dhService.setPsk(psk);
    }

    this._onCreated.fire(dhService);

    return dhService;
  };
}
