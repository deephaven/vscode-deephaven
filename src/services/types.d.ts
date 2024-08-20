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
  readonly isConnected: boolean;
  readonly serverUrl: string;

  initDh: () => Promise<boolean>;

  getConsoleTypes: () => Promise<Set<ConsoleType>>;

  runEditorCode: (
    editor: vscode.TextEditor,
    selectionOnly?: boolean
  ) => Promise<void>;
}

export interface IFactory<T, TArgs extends unknown[] = []> {
  create: (...args: TArgs) => T;
}

/**
 * Factory for creating IDhService instances.
 */
export type IDhServiceFactory = IFactory<IDhService, [serverUrl: string]>;

/**
 * Server manager interface.
 */
export interface IServerManager extends Disposable {
  connectToServer: (serverUrl: string) => Promise<void>;
  disconnectFromServer: (serverUrl: string) => Promise<void>;

  hasConnection: (serverUrl: string) => boolean;

  getEditorConnection: (
    editor: vscode.TextEditor
  ) => Promise<IDhService | null>;
  getServers: () => ServerState[];
  getConnections: () => IDhService[];
  updateStatus: () => Promise<void>;

  consoleTypeConnections: (consoleType: ConsoleType) => Promise<IDhService[]>;

  onDidUpdate: vscode.Event<void>;
}

/**
 * Message toaster interface.
 */
export interface IToaster {
  error: (message: string) => Promise<void>;
  info: (message: string) => Promise<void>;
}
