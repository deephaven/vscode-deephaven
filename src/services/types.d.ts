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
  readonly serverUrl: vscode.Uri;

  initDh: () => Promise<boolean>;

  getConsoleTypes: () => Promise<Set<ConsoleType>>;
  supportsConsoleType: (consoleType: ConsoleType) => Promise<boolean>;

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
export type IDhServiceFactory = IFactory<IDhService, [serverUrl: vscode.Uri]>;

/**
 * Server manager interface.
 */
export interface IServerManager extends Disposable {
  connectToServer: (serverUrl: vscode.Uri) => Promise<void>;
  disconnectFromServer: (serverUrl: vscode.Uri) => Promise<void>;
  loadServerConfig: () => void;

  hasConnection: (serverUrl: vscode.Uri) => boolean;
  hasConnectionUris: (connection: IDhService) => boolean;

  getConnections: () => IDhService[];
  getConnectionUris: (connection: IDhService) => vscode.Uri[];
  getEditorConnection: (
    editor: vscode.TextEditor
  ) => Promise<IDhService | null>;
  setEditorConnection: (
    editor: vscode.TextEditor,
    dhService: IDhService
  ) => Promise<void>;
  getFirstConsoleTypeConnection: (
    consoleType: ConsoleType
  ) => Promise<IDhService | null>;
  getServers: () => ServerState[];
  getUriConnection: (uri: vscode.Uri) => IDhService | null;
  updateStatus: () => Promise<void>;

  onDidConnect: vscode.Event<vscode.Uri>;
  onDidDisconnect: vscode.Event<vscode.Uri>;
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
