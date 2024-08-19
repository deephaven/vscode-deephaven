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
  loadServerConfig: () => void;

  hasConnection: (serverUrl: string) => boolean;
  hasConnectionUris: (connection: IDhService) => boolean;

  getConnections: () => IDhService[];
  getConnectionUris: (connection: IDhService) => vscode.Uri[];
  getEditorConnection: (
    editor: vscode.TextEditor
  ) => Promise<IDhService | null>;
  getFirstConsoleTypeConnection: (
    consoleType: ConsoleType
  ) => Promise<IDhService | null>;
  getServers: () => ServerState[];
  getUriConnection: (uri: vscode.Uri) => IDhService | null;
  updateStatus: () => Promise<void>;

  onDidRegisterEditor: vscode.Event<vscode.Uri>;
  onDidUpdate: vscode.Event<void>;
}

/**
 * Message toaster interface.
 */
export interface IToastService {
  error: (message: string) => Promise<void>;
  info: (message: string) => Promise<void>;
}
