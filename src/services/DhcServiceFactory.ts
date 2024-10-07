import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { DhcService } from './DhcService';
import type {
  IDhServiceFactory,
  IPanelService,
  IToastService,
  Lazy,
} from '../types';
import type { URLMap } from './URLMap';

/**
 * Factory for creating DhcService instances.
 */
export class DhcServiceFactory implements IDhServiceFactory {
  constructor(
    private coreCredentialsCache: URLMap<Lazy<DhcType.LoginCredentials>>,
    private panelService: IPanelService,
    private diagnosticsCollection: vscode.DiagnosticCollection,
    private outputChannel: vscode.OutputChannel,
    private toaster: IToastService
  ) {}

  create = (serverUrl: URL): DhcService => {
    const dhService = new DhcService(
      serverUrl,
      this.coreCredentialsCache,
      this.panelService,
      this.diagnosticsCollection,
      this.outputChannel,
      this.toaster
    );

    return dhService;
  };
}
