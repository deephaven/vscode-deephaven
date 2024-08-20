import * as vscode from 'vscode';
import type { ServerState, ServerConnectionState } from '../common';
import { isDhcServerRunning } from '../dh/dhc';
import { isDheServerRunning } from '../dh/dhe';
import { IConfigService, IServerManager } from './types';
import { getInitialServerStates } from '../util/serverUtils';

export class ServerManager implements IServerManager {
  private _serverMap: Map<string, ServerState>;
  private _connectionMap: Map<string, ServerConnectionState>;

  private _onDidUpdate = new vscode.EventEmitter<void>();
  readonly onDidUpdate = this._onDidUpdate.event;

  constructor(configService: IConfigService) {
    const initialDhcServerState = getInitialServerStates(
      'DHC',
      configService.getCoreServers()
    );

    const initialDheServerState = getInitialServerStates(
      'DHE',
      configService.getEnterpriseServers()
    );

    const initialConnectionState: ServerConnectionState[] = [];

    this._serverMap = new Map(
      [...initialDhcServerState, ...initialDheServerState].map(state => [
        state.url,
        state,
      ])
    );

    this._connectionMap = new Map(
      initialConnectionState.map(state => [state.url, state])
    );
  }

  getServers = (): ServerState[] => {
    return [...this._serverMap.values()];
  };

  getConnections = (): ServerConnectionState[] => {
    return [...this._connectionMap.values()];
  };

  updateStatus = async (): Promise<void> => {
    const promises = this.getServers().map(server =>
      (server.type === 'DHC'
        ? isDhcServerRunning(server.url)
        : isDheServerRunning(server.url)
      ).then(isRunning => {
        this._serverMap.set(server.url, { ...server, isRunning });
        if ((server.isRunning ?? false) !== isRunning) {
          this._onDidUpdate.fire();
        }
      })
    );

    await Promise.all(promises);
  };

  async dispose(): Promise<void> {}
}
