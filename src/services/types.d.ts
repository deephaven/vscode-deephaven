import * as vscode from 'vscode';
import type {
  CoreConnectionConfig,
  Disposable,
  EnterpriseConnectionConfig,
  ServerState,
  ServerConnectionState,
} from '../common';

/**
 * Configuration service interface.
 */
export interface IConfigService {
  getCoreServers: () => CoreConnectionConfig[];
  getEnterpriseServers: () => EnterpriseConnectionConfig[];
}

/**
 * Server manager interface.
 */
export interface IServerManager extends Disposable {
  onDidUpdate: vscode.Event<void>;

  getServers: () => ServerState[];
  getConnections: () => ServerConnectionState[];
  updateStatus: () => Promise<void>;
}
