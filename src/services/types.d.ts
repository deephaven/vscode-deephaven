import * as vscode from 'vscode';
import type {
  ConsoleType,
  CoreConnectionConfig,
  Disposable,
  EnterpriseConnectionConfig,
  ServerState,
} from '../common';
import { EventDispatcher } from './EventDispatcher';

/**
 * Configuration service interface.
 */
export interface IConfigService {
  getCoreServers: () => CoreConnectionConfig[];
  getEnterpriseServers: () => EnterpriseConnectionConfig[];
}

/**
 * Service that manages connections + sessions to a DH worker.
 */
export interface IDhService<TDH = unknown, TClient = unknown>
  extends Disposable,
    EventDispatcher<'disconnect'> {
  readonly isInitialized: boolean;
  readonly serverUrl: string;

  initDh: () => Promise<boolean>;

  getConsoleTypes: () => Promise<ConsoleType[]>;

  runEditorCode: (
    editor: vscode.TextEditor,
    selectionOnly?: boolean
  ) => Promise<void>;
}

/**
 * Server manager interface.
 */
export interface IServerManager extends Disposable {
  onDidUpdate: vscode.Event<void>;

  getServers: () => ServerState[];
  getConnections: () => IDhService[];
  updateStatus: () => Promise<void>;
}
