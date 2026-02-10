import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import type {
  ConsoleType,
  CoreConnectionConfig,
  IDisposable,
  EnterpriseConnectionConfig,
  ConnectionState,
  ServerState,
  VariableChanges,
  VariableDefintion,
  VariableID,
  WorkerInfo,
  UniqueID,
  UserKeyPairs,
  UserLoginPreferences,
  CoreUnauthenticatedClient,
  Psk,
  CoreAuthenticatedClient,
  WorkerURL,
  DheAuthenticatedClientWrapper,
  DheServerFeatures,
  DheUnauthenticatedClientWrapper,
} from '../types/commonTypes';
import type {
  UnauthenticatedClient as DheUnauthenticatedClient,
  Username,
} from '@deephaven-enterprise/auth-nodejs';
import type { QuerySerial } from '../shared';

export interface IAsyncCacheService<TKey, TValue> extends IDisposable {
  get: (key: TKey) => Promise<TValue>;
  has: (key: TKey) => boolean;
  invalidate: (key: TKey) => void;
  onDidInvalidate: vscode.Event<TKey>;
}

/**
 * Configuration service interface.
 */
export interface IConfigService {
  isElectronFetchEnabled: () => boolean;
  isMcpDocsEnabled: () => boolean;
  isMcpEnabled: () => boolean;
  getCoreServers: () => CoreConnectionConfig[];
  getEnterpriseServers: () => EnterpriseConnectionConfig[];
  getMcpAutoUpdateConfig: () => boolean;
  setMcpAutoUpdateConfig: (value: boolean) => Promise<void>;
  toggleMcp: (enable?: boolean) => Promise<void>;
  updateWindsurfMcpConfig(port: number): Promise<boolean>;
}

/**
 * Service that manages connections + sessions to a DH worker.
 */
export interface IDhcService extends IDisposable, ConnectionState {
  readonly isInitialized: boolean;
  readonly isConnected: boolean;
  isRunningCode: boolean;

  readonly onDidDisconnect: vscode.Event<URL>;
  readonly onDidChangeRunningCodeStatus: vscode.Event<boolean>;

  initSession(): Promise<boolean>;
  getClient(): Promise<CoreAuthenticatedClient | null>;
  getConsoleTypes: () => Promise<Set<ConsoleType>>;
  getPsk(): Promise<Psk | undefined>;
  supportsConsoleType: (consoleType: ConsoleType) => Promise<boolean>;

  runCode: (
    documentOrText: vscode.TextDocument | string,
    languageId: string,
    ranges?: readonly vscode.Range[]
  ) => Promise<DhcType.ide.CommandResult | null>;
}

export interface IDheService extends ConnectionState, IDisposable {
  readonly onDidWorkerTerminate: vscode.Event<WorkerURL>;

  getClient(
    initializeIfNull: false
  ): Promise<DheAuthenticatedClientWrapper | null>;
  getClient(
    initializeIfNull: true,
    operateAsAnotherUser: boolean
  ): Promise<DheAuthenticatedClientWrapper | null>;
  getQuerySerialFromTag(tagId: UniqueID): Promise<QuerySerial | null>;
  getServerFeatures(): DheServerFeatures | undefined;
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
) => Promise<CoreUnauthenticatedClient & IDisposable>;

/**
 * Factory for creating IDhService instances.
 */
export type IDhcServiceFactory = IFactory<
  IDhcService,
  [serverUrl: URL, tagId?: UniqueID]
>;
export type IDheClientFactory = (
  serverUrl: URL
) => Promise<DheUnauthenticatedClientWrapper>;
export type IDheServiceFactory = IFactory<IDheService, [serverUrl: URL]>;

export type IInteractiveConsoleQueryFactory = (
  serverUrl: URL,
  tagId: UniqueID,
  consoleType?: ConsoleType
) => Promise<QuerySerial | null>;

export interface IPanelService extends IDisposable {
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
export interface IServerManager extends IDisposable {
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
  getConnections: (serverOrWorkerUrl?: URL) => ConnectionState[];
  getConnectionUris: (connection: ConnectionState) => vscode.Uri[];
  getDheServiceForWorker: (maybeWorkerUrl: URL) => Promise<IDheService | null>;
  getEditorConnection: (uri: vscode.Uri) => Promise<ConnectionState | null>;
  getWorkerCredentials: (
    serverOrWorkerUrl: URL | WorkerURL
  ) => Promise<DhcType.LoginCredentials | null>;
  getWorkerInfo: (maybeWorkerUrl: URL) => Promise<WorkerInfo | undefined>;
  setEditorConnection: (
    uri: vscode.Uri,
    languageId: string,
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
  syncManagedServers: (
    urls: URL[],
    preferExistingPsk?: boolean
  ) => Promise<void>;
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
