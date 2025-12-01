import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import type {
  AuthenticatedClient as DheAuthenticatedClientBase,
  Base64KeyPair,
  KeyPairCredentials,
  OperateAsUsername,
  PasswordCredentials,
  UnauthenticatedClient as DheUnauthenticatedClientBase,
  Username,
} from '@deephaven-enterprise/auth-nodejs';
import type { Brand, QuerySerial, SerializableRefreshToken } from '../shared';

export type NonEmptyArray<T> = [T, ...T[]];

export type UniqueID = Brand<'UniqueID', string>;

export type Port = Brand<'Port', number>;

export type ConnectionType = 'DHC';

export type ConsoleType = 'groovy' | 'python';

export type CoreConnectionConfigStored =
  | string
  | {
      label?: string;
      url: string;
    };

export interface CoreConnectionConfig {
  label?: string;
  url: URL;
}

export type CoreAuthenticatedClient = Brand<
  'CoreAuthenticatedClient',
  DhcType.CoreClient
>;
export type CoreUnauthenticatedClient = Brand<
  'CoreUnauthenticatedClient',
  DhcType.CoreClient
>;

export type DheAuthenticatedClientWrapper = Partial<IDisposable> & {
  client: DheAuthenticatedClientBase;
  refreshTokenSerialized: Promise<SerializableRefreshToken | null>;
};
export type DheUnauthenticatedClientWrapper = Partial<IDisposable> & {
  client: DheUnauthenticatedClientBase;
  refreshTokenSerialized: Promise<SerializableRefreshToken | null>;
};

export interface DheServerFeatures {
  version: number;
  features: {
    createQueryIframe: boolean;
  };
}

export type DependencyName = Brand<'DependencyName', string>;
export type DependencyVersion = Brand<'DependencyVersion', string>;

export type EnterpriseConnectionConfigStored =
  | Brand<'EnterpriseConnectionConfigStored'>
  | { url: string; label?: string; experimentalWorkerConfig?: WorkerConfig };

export interface EnterpriseConnectionConfig {
  url: URL;
  label?: string;
  experimentalWorkerConfig?: WorkerConfig;
}

export interface SamlConfig {
  loginClass: string;
  providerName: string;
  loginUrl: string;
}

export interface MultiAuthConfig {
  isPasswordEnabled: true;
  samlConfig: SamlConfig;
}

// Mutually exclusive password or SAML auth config
export type SingleAuthConfig =
  | { isPasswordEnabled: true; samlConfig: null }
  | { isPasswordEnabled: false; samlConfig: SamlConfig };

export type NoAuthConfig = {
  isPasswordEnabled: false;
  samlConfig: null;
};

export type AuthConfig = MultiAuthConfig | SingleAuthConfig | NoAuthConfig;

export interface PasswordAuthFlow {
  type: 'password';
}

export interface SamlAuthFlow {
  type: 'saml';
  config: SamlConfig;
}

export type AuthFlow = PasswordAuthFlow | SamlAuthFlow;

export interface SamlAuthScopes {
  serverUrl: string;
  samlLoginUrl: string;
}

export type LoginPromptCredentials =
  | PasswordCredentials
  | Omit<KeyPairCredentials, 'keyPair'>;

export type LoginWorkflowType = 'login' | 'generatePrivateKey';

export type Psk = Brand<'Psk', string>;

export type UserKeyPairs = Record<Username, Base64KeyPair>;
export type UserLoginPreferences = {
  lastLogin?: Username;
  operateAsUser: Record<Username, OperateAsUsername>;
};

export type ServerConnectionConfig =
  | CoreConnectionConfig
  | EnterpriseConnectionConfig
  | URL;

export interface WorkerConfig {
  additionalMemory?: number;
  classPaths?: string;
  dbServerName?: string;
  engine?: string;
  envVars?: string;
  heapSize?: number;
  jvmArgs?: string;
  jvmProfile?: string;
  scriptLanguage?: string;
}

export interface ConnectionState {
  readonly isConnected: boolean;
  readonly isRunningCode?: boolean;
  readonly serverUrl: URL;
  readonly tagId?: UniqueID;
}

export type GrpcURL = Brand<'GrpcURL', URL>;
export type IdeURL = Brand<'IdeUrl', URL>;
export type JsapiURL = Brand<'JsapiURL', URL>;
export type WorkerURL = Brand<'WorkerURL', URL>;

export interface WorkerInfo {
  tagId: UniqueID;
  envoyPrefix: string | null;
  grpcUrl: GrpcURL;
  ideUrl: IdeURL;
  jsapiUrl: JsapiURL;
  processInfoId: string | null;
  serial: QuerySerial;
  workerName: string | null;
  workerUrl: WorkerURL;
}

export interface IDisposable {
  dispose(): Promise<void>;
}

export type EventListenerT = <TEvent>(event: TEvent) => void;
export type Lazy<T> = () => Promise<T>;
export type UnsubscribeEventListener = () => void;

export type ServerType = 'DHC' | 'DHE';

export interface UnmanagedServerState {
  isManaged?: false;
}

export interface ManagedServerState {
  isManaged: true;
  psk: Psk;
}

export type ServerState = {
  type: ServerType;
  url: URL;
  label?: string;
  isConnected: boolean;
  isRunning: boolean;
  connectionCount: number;
} & (UnmanagedServerState | ManagedServerState);

export type VariableID = Brand<'VariableID'>;

export type VariableDefintion = DhcType.ide.VariableDefinition & {
  id: VariableID;
  type: VariableType;
};

export type VariableMap = Map<VariableID, VariableDefintion>;
export type VariablePanelMap = Map<VariableID, vscode.WebviewPanel>;

export interface VariableChanges {
  readonly created: VariableDefintion[];
  readonly removed: VariableDefintion[];
  readonly updated: VariableDefintion[];
}

export type VariableType =
  | 'deephaven.plot.express.DeephavenFigure'
  | 'deephaven.ui.Element'
  | 'Figure'
  | 'HierarchicalTable'
  | 'OtherWidget'
  | 'pandas.DataFrame'
  | 'PartitionedTable'
  | 'Table'
  | 'TableMap'
  | 'Treemap'
  | 'TreeTable';

export interface LoginOptionsResponsePostMessage {
  message: 'vscode-ext.loginOptions';
  payload: {
    id: string;
    payload: DhcType.LoginCredentials;
  };
  targetOrigin: IdeURL;
}

export interface SessionDetailsResponsePostMessage {
  message: 'vscode-ext.sessionDetails';
  payload: {
    id: string;
    payload: {
      workerName: string | null;
      processInfoId: string | null;
    };
  };
  targetOrigin: IdeURL;
}

export interface CodeBlock {
  languageId: string;
  range: vscode.Range;
}

export interface SerializedPoint {
  line: number;
  character: number;
}

export type SerializedRange = [start: SerializedPoint, end: SerializedPoint];
