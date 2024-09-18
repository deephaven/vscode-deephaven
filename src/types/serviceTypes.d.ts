import * as vscode from 'vscode';
import type {
  ConsoleType,
  CoreConnectionConfig,
  Disposable,
  EnterpriseConnectionConfig,
  EventListenerT,
  ServerConnection,
  ServerState,
  UnsubscribeEventListener,
  VariableChanges,
  VariableDefintion,
  VariableID,
} from '../types/commonTypes';

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
    ServerConnection {
  readonly isInitialized: boolean;
  readonly isConnected: boolean;
  readonly onDidDisconnect: vscode.Event<URL>;

  initDh: () => Promise<boolean>;

  getConsoleTypes: () => Promise<Set<ConsoleType>>;
  supportsConsoleType: (consoleType: ConsoleType) => Promise<boolean>;

  runEditorCode: (
    editor: vscode.TextEditor,
    selectionOnly?: boolean
  ) => Promise<void>;
}

/**
 * @deprecated Use `vscode.EventEmitter` instead.
 */
export interface IEventDispatcher<TEventName extends string> {
  addEventListener: (
    eventName: TEventName,
    listener: EventListenerT
  ) => UnsubscribeEventListener;

  dispatchEvent: <TEvent>(eventName: TEventName, event?: TEvent) => void;
}

export interface IFactory<T, TArgs extends unknown[] = []> {
  create: (...args: TArgs) => T;
}

/**
 * Factory for creating IDhService instances.
 */
export type IDhServiceFactory = IFactory<
  IDhService,
  [serverUrl: URL, psk?: string]
>;

export interface IPanelService extends Disposable {
  readonly onDidUpdate: vscode.Event<void>;

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
 * Server manager interface.
 */
export interface IServerManager extends Disposable {
  canStartServer: boolean;

  connectToServer: (serverUrl: URL) => Promise<IDhService | null>;
  disconnectEditor: (uri: vscode.Uri) => void;
  disconnectFromServer: (serverUrl: URL) => Promise<void>;
  loadServerConfig: () => Promise<void>;

  hasConnection: (serverUrl: URL) => boolean;
  hasConnectionUris: (connection: IDhService) => boolean;

  getConnection: (serverUrl: URL) => IDhService | undefined;
  getConnections: () => IDhService[];
  getConnectionUris: (connection: IDhService) => vscode.Uri[];
  getEditorConnection: (
    editor: vscode.TextEditor
  ) => Promise<IDhService | null>;
  setEditorConnection: (
    editor: vscode.TextEditor,
    dhService: IDhService
  ) => Promise<void>;

  getServer: (serverUrl: URL) => ServerState | undefined;
  getServers: (filter?: {
    isRunning?: boolean;
    hasConnections?: boolean;
  }) => ServerState[];
  getUriConnection: (uri: vscode.Uri) => IDhService | null;
  hasEverUpdatedStatus: () => boolean;
  syncManagedServers: (urls: URL[]) => void;
  updateStatus: (filterBy?: URL[]) => Promise<void>;

  onDidConnect: vscode.Event<URL>;
  onDidDisconnect: vscode.Event<URL>;
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
