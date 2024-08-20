import * as vscode from 'vscode';
import type { ServerState, WorkerState } from '../common';
import { isDhcServerRunning } from '../dh/dhc';
import { isDheServerRunning } from '../dh/dhe';
import { IConfigService, IWorkerManager } from './types';
import { getInitialServerStates } from '../util/workerUtils';

export class WorkerManager implements IWorkerManager {
  private _serverMap: Map<string, ServerState>;
  private _workerMap: Map<string, WorkerState>;

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

    const initialWorkerState: WorkerState[] = [];

    this._serverMap = new Map(
      [...initialDhcServerState, ...initialDheServerState].map(state => [
        state.url,
        state,
      ])
    );

    this._workerMap = new Map(
      initialWorkerState.map(state => [state.url, state])
    );
  }

  getServers = (): ServerState[] => {
    return [...this._serverMap.values()];
  };

  getWorkers = (): WorkerState[] => {
    return [...this._workerMap.values()];
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
