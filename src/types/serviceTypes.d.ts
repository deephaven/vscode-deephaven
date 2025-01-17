import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import type {
  ConsoleType,
  CoreConnectionConfig,
  Disposable,
  EnterpriseConnectionConfig,
  EventListenerT,
  ConnectionState,
  ServerState,
  UnsubscribeEventListener,
  VariableChanges,
  VariableDefintion,
  VariableID,
  WorkerInfo,
  WorkerURL,
  UniqueID,
  UserKeyPairs,
  UserLoginPreferences,
  CoreUnauthenticatedClient,
  Psk,
  CoreAuthenticatedClient,
} from '../types/commonTypes';
import type {
  AuthenticatedClient as DheAuthenticatedClient,
  UnauthenticatedClient as DheUnauthenticatedClient,
  Username,
} from '@deephaven-enterprise/auth-nodejs';

export interface IAsyncCacheService<TKey, TValue> extends Disposable {
  get: (key: TKey) => Promise<TValue>;
  has: (key: TKey) => boolean;
  invalidate: (key: TKey) => void;
  onDidInvalidate: vscode.Event<TKey>;
}

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
export interface IDhcService extends Disposable, ConnectionState {
  readonly isInitialized: boolean;
  readonly isConnected: boolean;
  readonly onDidDisconnect: vscode.Event<URL>;

  initSession(): Promise<boolean>;
  getClient(): Promise<CoreAuthenticatedClient | null>;
  getConsoleTypes: () => Promise<Set<ConsoleType>>;
  supportsConsoleType: (consoleType: ConsoleType) => Promise<boolean>;

  runEditorCode: (
    editor: vscode.TextEditor,
    selectionOnly?: boolean
  ) => Promise<void>;
}

export interface IDheService extends ConnectionState, Disposable {
  getClient(initializeIfNull: false): Promise<DheAuthenticatedClient | null>;
  getClient(
    initializeIfNull: true,
    operateAsAnotherUser: boolean
  ): Promise<DheAuthenticatedClient | null>;
  getWorkerInfo: (workerUrl: WorkerURL) => WorkerInfo | undefined;
  createWorker: (
    tagId: UniqueID,
    consoleType?: ConsoleType
  ) => Promise<WorkerInfo>;
  deleteWorker: (workerUrl: WorkerURL) => Promise<void>;
}

export interface IFactory<T, TArgs extends unknown[] = []> {
  create: (...args: TArgs) => T;
}

export type ICoreClientFactory = (
  serverUrl: URL
) => Promise<CoreUnauthenticatedClient & Disposable>;

/**
 * Factory for creating IDhService instances.
 */
export type IDhcServiceFactory = IFactory<
  IDhcService,
  [serverUrl: URL, tagId?: UniqueID]
>;
export type IDheClientFactory = (
  serverUrl: URL
) => Promise<DheUnauthenticatedClient & Disposable>;
export type IDheServiceFactory = IFactory<IDheService, [serverUrl: URL]>;

export interface IPanelService extends Disposable {
  readonly onDidUpdate: vscode.Event<void>;

  clearServerData: (url: URL) => void;
  getPanels: (url: URL) => Iterable<vscode.WebviewPanel>;
  getPanelUrls: () => URL[];
  getPanelVariables: (url: URL) => VariableDefintion[];
  getPanelOrThrow: (url: URL, variableId: VariableID) => vscode.WebviewPanel;
  deletePanel: (url: URL, variableId: VariableID) => void;
  hasPanel: (url: URL, variableId: VariableID) => boolean;
  setPanel: (
    url: URL,
    variableId: VariableID,
    panel: vscode.WebviewPanel
  ) => void;
  getVariables: (url: URL) => Iterable<VariableDefintion>;
  updateVariables: (url: URL, changes: VariableChanges) => void;
}

/**
 * Secret service interface.
 */
export interface ISecretService {
  clearStorage(): Promise<void>;
  // PSKs
  deletePsk(serverUrl: URL): Promise<void>;
  getPsk(serverUrl: URL): Promise<Psk | undefined>;
  storePsk(serverUrl: URL, psk: Psk): Promise<void>;
  // DHE Server keys
  deleteUserServerKeys(serverUrl: URL, userName: Username): Promise<void>;
  getServerKeys(serverUrl: URL): Promise<UserKeyPairs>;
  storeServerKeys(serverUrl: URL, serverKeys: UserKeyPairs): Promise<void>;
  // Login preferences
  getUserLoginPreferences(serverUrl: URL): Promise<UserLoginPreferences>;
  storeUserLoginPreferences(
    serverUrl: URL,
    preferences: UserLoginPreferences
  ): Promise<void>;
}

/**
 * Server manager interface.
 */
export interface IServerManager extends Disposable {
  canStartServer: boolean;

  connectToServer: (
    serverUrl: URL,
    workerConsoleType?: ConsoleType,
    operateAsAnotherUser?: boolean
  ) => Promise<ConnectionState | null>;
  disconnectEditor: (uri: vscode.Uri) => void;
  disconnectFromDHEServer: (dheServerUrl: URL) => Promise<void>;
  disconnectFromServer: (serverUrl: URL) => Promise<void>;
  loadServerConfig: () => Promise<void>;

  hasConnectionUris: (connection: ConnectionState) => boolean;

  getConnection: (serverUrl: URL) => ConnectionState | undefined;
  getConnections: () => ConnectionState[];
  getConnectionUris: (connection: ConnectionState) => vscode.Uri[];
  getEditorConnection: (
    editor: vscode.TextEditor
  ) => Promise<ConnectionState | null>;
  getWorkerCredentials: (
    serverOrWorkerUrl: URL | WorkerURL
  ) => Promise<DhcType.LoginCredentials | null>;
  getWorkerInfo: (workerUrl: WorkerURL) => Promise<WorkerInfo | undefined>;
  setEditorConnection: (
    editor: vscode.TextEditor,
    dhService: ConnectionState
  ) => Promise<void>;

  getServer: (serverUrl: URL, matchPort?: boolean) => ServerState | undefined;
  getServers: (filter?: {
    isRunning?: boolean;
    hasConnections?: boolean;
    type?: 'DHC' | 'DHE';
  }) => ServerState[];
  getUriConnection: (uri: vscode.Uri) => ConnectionState | null;
  hasEverUpdatedStatus: () => boolean;
  syncManagedServers: (urls: URL[]) => void;
  updateStatus: (filterBy?: URL[]) => Promise<void>;

  onDidConnect: vscode.Event<URL>;
  onDidDisconnect: vscode.Event<URL>;
  onDidLoadConfig: vscode.Event<void>;
  onDidRegisterEditor: vscode.Event<vscode.Uri>;
  onDidServerStatusChange: vscode.Event<ServerState>;
  onDidUpdate: vscode.Event<void>;
}

/**
 * Message toaster interface.
 */
export interface IToastService {
  error: (message: string) => Promise<void>;
  info: (message: string) => Promise<void>;
}
