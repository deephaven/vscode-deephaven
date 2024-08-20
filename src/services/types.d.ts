import * as vscode from 'vscode';
import type {
  CoreConnectionConfig,
  Disposable,
  EnterpriseConnectionConfig,
  ServerState,
  WorkerState,
} from '../common';

/**
 * Configuration service interface.
 */
export interface IConfigService {
  getCoreServers: () => CoreConnectionConfig[];
  getEnterpriseServers: () => EnterpriseConnectionConfig[];
}

/**
 * Worker manager interface.
 */
export interface IWorkerManager extends Disposable {
  onDidUpdate: vscode.Event<void>;

  getServers: () => ServerState[];
  getWorkers: () => WorkerState[];
  updateStatus: () => Promise<void>;
}
