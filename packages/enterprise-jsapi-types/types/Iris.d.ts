// The iris api script isn't packaged as a module (yet), and is just included in index.html, exported to the global namespace
// This include file is simply a wrapper so that it behaves like a module, and can be mocked easily for unit tests.
// https://github.com/facebook/create-react-app/blob/master/packages/react-scripts/template/README.md#using-global-variables
import type { dh as DhType } from '@deephaven/jsapi-types';

import {
  Parameterized,
  ParameterizedQueryVariableType,
} from './parameterizedQueryTypes';
import { ControllerQueryConstants, WorkerKind } from './CommonTypes';

export type CancelablePromise<T> = Promise<T> & { cancel: () => undefined };

export interface IdeConnection extends DhType.IdeConnection {
  serviceId: string;
  processInfoId: string;
  running(): Promise<IdeConnection>;
  close(): void;
}

/**
 * There are a couple of methods on Enterprise that are not in Core (yet).
 * Technically, TreeTable does not extend DhType.TreeTable, but the API should match between Core and Enterprise.
 */
export interface TreeTable extends DhType.TreeTable {
  saveExpandedState: () => string;
  restoreExpandedState: (state: string) => void;
}

export interface BaseQueryInfo {
  adminGroups: readonly string[];

  /**
   * @deprecated use `type` instead
   */
  configurationType: string;
  configVersion: string;
  dataMemoryRatio: number;
  dbServerName: string;
  enabled: boolean;
  enableGcLogs: boolean;
  envVars: string;
  extraClasspaths: string;
  /**
   * @deprecated use `designated.grpcUrl` instead
   */
  grpcUrl: string;
  heapSize: number;
  additionalMemory: number;
  jvmArgs: string;
  jvmProfile: string;
  name: string;
  owner: string;
  restartUsers: number;
  /**
   * @deprecated use `designated.runningVersion` instead
   */
  runningVersion: string;
  scheduling: readonly string[];
  scriptLanguage: string | null;
  scriptPath: string | null;
  serial: string;
  status: string;
  timeout: number;
  type: string;
  typeSpecificFields: Record<string, { value: unknown }> | null;
  viewerGroups: readonly string[];
  workerKind: string;

  /**
   * JSON encoded string of the kubernetes, python and generic controls
   */
  kubernetesControl: string;
  pythonControl: string;
  genericWorkerControl: string;

  replicaCount: number;
  spareCount: number;
  assignmentPolicy: string | null;
  assignmentPolicyParams: string | null;
}

export interface ReplicaStatus {
  objects: readonly DhType.ide.VariableDefinition[];
  status: string | null;
  fullStackTrace: string | null;
  envoyPrefix: string | null;
  grpcUrl: string;
  jsApiUrl: string;
  ideUrl: string;
  runningVersion: string;
  websocketUrl: string | null;
  numberFailures: number;
  workerHost: string | null;
  workerName: string | null;
  communityPort: number | null;
  websocketPort: number | null;
  workerPort: number | null;
  initStartTime: DhType.DateWrapper | null;
  processInfoId: string | null;
  createWorkspaceData(data: { id?: string; data: string }): Promise<string>;
  getObject(
    object: DhType.ide.VariableDescriptor
  ): Promise<DhType.ide.VariableDefinition>;
  getTable(tableName: string): Promise<DhType.Table>;
  getTreeTable(tableName: string): Promise<DhType.TreeTable>;
  mergeTables(tables: DhType.Table[]): Promise<DhType.Table>;
  newTable(
    names: string[],
    types: string[],
    data: unknown[]
  ): Promise<DhType.Table>;
}

export interface QueryInfo extends Readonly<BaseQueryInfo> {
  designated?: ReplicaStatus;
  displayable: boolean;
  /**
   * @deprecated Use `designated.envoyPrefix` instead
   */
  envoyPrefix: string | null;
  /**
   * @deprecated Use `designated.fullStackTrace` instead
   */
  fullStackTrace: string;
  /**
   * @deprecated Use `designated.ideUrl` instead
   */
  ideUrl: string;
  /**
   * @deprecated Use `designated.jsApiUrl` instead
   */
  jsApiUrl: string;
  /**
   * @deprecated use `designated.objects` instead
   */
  objects: readonly DhType.ide.VariableDefinition[];
  /**
   * @deprecated Use `designated.websocketUrl` instead
   */
  websocketUrl: string | null;
  /**
   * @deprecated Use `designated.numberFailures` instead
   */
  numberFailures: number;
  /**
   * @deprecated Use `designated.workerHost` instead
   */
  workerHost: string | null;
  /**
   * @deprecated Use `designated.workerName` instead
   */
  workerName: string | null;
  /**
   * @deprecated Use `designated.communityPort` instead
   */
  communityPort: number | null;
  /**
   * @deprecated Use `designated.websocketPort` instead
   */
  websocketPort: number | null;
  /**
   * @deprecated Use `designated.workerPort` instead
   */
  workerPort: number | null;
  /**
   * @deprecated Use `designated.initStartTime` instead
   */
  initStartTime: DhType.DateWrapper | null;
  initEndTime: DhType.DateWrapper | null;
  lastUpdateTime: DhType.DateWrapper | null;
  /**
   * @deprecated Use `designated.processInfoId` instead
   */
  processInfoId: string | null;
  lastModifiedTime: DhType.DateWrapper | null;
  lastModifiedByAuthenticated: string | null;
  schedulingStartTime: string | null;
  schedulingEndTime: string | null;
  schedulingTimeZone: string | null;
  schedulingDetails: string | null;
  replicaCount: number;
  spareCount: number;
  replicas: ReplicaStatus[];
  spares: ReplicaStatus[];
  getReplicaStatus(slot: number): ReplicaStatus | null;

  /**
   * @deprecated use `objects` instead
   */
  tables: readonly string[];
  /**
   * @deprecated use `designated.newTable` instead
   */
  mergeTables(tables: DhType.Table[]): Promise<DhType.Table>;
  /**
   * @deprecated use `designated.newTable` instead
   */
  newTable(
    names: string[],
    types: string[],
    data: unknown[]
  ): Promise<DhType.Table>;
  /**
   * @deprecated use `designated.newTable` instead
   */
  createWorkspaceData(data: { id?: string; data: string }): Promise<string>;
  /**
   * @deprecated use `designated.getTreeTable` instead
   */
  getTreeTable(tableName: string): Promise<DhType.TreeTable>;
  /**
   * @deprecated use `designated.getTable` instead
   */
  getTable(tableName: string): Promise<DhType.Table>;
  /**
   * @deprecated use `designated.getObject` instead
   */
  getObject(
    object: DhType.ide.VariableDescriptor
  ): Promise<DhType.ide.VariableDefinition>;
  getFigure(figureName: string): Promise<DhType.plot.Figure>;
  saveWorkspaceData(data: { id?: string; data: string }): Promise<void>;
}

export interface AbstractIrisWebServer {
  businessCalendars: readonly string[];
  dbServers: readonly ConsoleServerAddress[];
  queryTypes: ReadonlyMap<string, string>;
  jvmProfiles: readonly string[];
  queryConstants: ControllerQueryConstants;
}

export interface UserInfo {
  username: string;
  operateAs: string;
}

export interface QuerySelectionPermissions {
  allAdmin: boolean;
  allOwner: boolean;
  allRestartable: boolean;
}

export interface ClientListenerEvent<TDetail = unknown> {
  detail: TDetail;
}

export interface DriverWrapper {
  catalogName: string;
  defaultUrl: string;
  friendlyName: string;
}

export interface AssignmentPolicyType {
  name: string;
  description: string;
  displayName: string;
  acceptsParams: boolean;
}

export type AssignmentPolicyTypes = Map<string, AssignmentPolicyType>;

export interface EnterpriseClient {
  /**
   * Get available assignment policy types.
   * @returns A Promise resolving to a map of assignment policy types.
   */
  getAssignmentPolicyTypes(): Promise<AssignmentPolicyTypes>;
  getDefaultAssignmentPolicy(): Promise<string>;
  getDefaultAssignmentPolicyParams(): Promise<string>;
  getQuerySelectionPermissions(
    serialIds: string[]
  ): Promise<QuerySelectionPermissions>;
  getEditableQuery(serialId: string): Promise<EditableQueryInfo>;
  getKnownConfigs(): QueryInfo[];
  addEventListener(
    type: string,
    listener: (event: CustomEvent) => void
  ): () => void;
  removeEventListener(
    type: string,
    listener: (event: ClientListenerEvent) => void
  ): void;
  disconnect(): void;
  getDispatcher(
    serverGroup: string,
    heapSizeMB: number,
    engine: string
  ): Promise<ConsoleServerAddress>;
  saveQuery(query: EditableQueryInfo, doRestart: boolean): Promise<void>;
  createQuery(query: EditableQueryInfo): Promise<string>;
  createAuthToken(key: string): Promise<string>;
  /** Imports the XML string as queries, and returns the query info. Does _not_ actually create them, use `saveQueries()` to save them. */
  importQueries: (xml: string) => Promise<QueryInfo[]>;
  /** Returns a string containing the XML of all queries specified */
  exportQueries: (serialIds: string[]) => Promise<string>;
  relogin(token: unknown): Promise<void>;
  getAllGroups(): Promise<string[]>;
  getAllUsers(): Promise<string[]>;
  getTemporaryQueueNames(): Promise<string[]>;
  getScriptPaths(serialId: string | null, owner?: string): Promise<string[]>;
  getQuerySerialsForDependent(isTemporary: boolean): Promise<string[]>;
  getDbServersForType(type: string): Promise<ConsoleServerAddress[]>;
  getJdbcDriverWrappers(): Promise<DriverWrapper[]>;
  encrypt(value: string): Promise<string>;
  /**
   * Save queries to the system.
   * @param queries Query info to save
   * @param replaceExisting Whether to replace existing queries or create new ones. If a serial is specified on a query and it is saved and `replaceExisting` is false, it will throw an error if a query with that serial already exists.
   */
  saveQueries: (
    queries: readonly EditableQueryInfo[],
    replaceExisting: boolean
  ) => Promise<SaveQueriesResult>;
  getAuthConfigValues(): Promise<string[][]>;
  onConnected(timeout: number): Promise<void>;

  getConsoleServers(): Promise<ConsoleServerAddress[]>;
  getDbServers(): Promise<ConsoleServerAddress[]>;
  getJvmProfiles(): Promise<string[]>;
  getQueryConstants(): Promise<QueryConstants>;
  getServerConfigValues(): Promise<ServerConfigValues>;
  getBusinessCalendars(): Promise<string[]>;
  getDefaultCalendar(): Promise<string>;
  getGroupsForUser(): Promise<string[]>;
  getUserInfo(): Promise<UserInfo>;
  getQueryConfigurationTypes(): Promise<Map<string, QueryConfigurationType>>;
  login(credentials: LoginCredentials): Promise<void>;
  restartQueries(serialIds: string[]): Promise<void>;
  stopQueries(serialIds: string[]): Promise<void>;
  getScriptBody(
    path: string | null,
    owner: string | null,
    serialId: string | null
  ): Promise<string>;
  getImportSources(
    namespace: string,
    table: string,
    type: ImportSourceTypeOption
  ): Promise<string[]>;
}

export interface LoginCredentials {
  username?: string;
  type: string;
  token: string;
  operateAs?: string;
}
export interface QueryConfigurationType {
  name: string;
  displayName: string;
  supportsCommunity: boolean;
  temporary: boolean;
  hasScript: boolean;
  allowedGroups: string[];
  serverClasses: string[];
  isDisplayable: boolean;
  supportsReplicas: boolean;
}

export type QueryConstants = {
  getMaxHeapGbForServer: (name?: string) => number;
  consoleDefaultHeap: number;
  pqDefaultHeap: number;
  minHeapGb: number;
  minDataRatio: number;
  maxDataRatio: number;
  maxScriptCodeLength: number;
};

export interface EnterpriseClientConstructor {
  new (websocketUrl: string): EnterpriseClient;
}

export interface ConsoleConfigConstructor {
  new (): ConsoleConfig;
}

export interface DhcConnectionDetails {
  readonly envoyPrefix: string | null;
  readonly grpcUrl: string;
  readonly ideUrl: string;
  readonly jsApiUrl: string;
  readonly serviceId: string;
  readonly processInfoId: string;
  readonly workerName: string;

  close(): void;
  addEventListener: (
    name: string,
    callback: (event: CustomEvent) => void
  ) => () => void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface ConsoleConfig {
  dispatcherHost?: string;
  dispatcherPort?: number;
  queryDescription: string;
  jvmProfile: string;
  maxHeapMb: number;
  additionalMemoryMb: number;
  jvmArgs: string[];
  envVars: [string, string][];
  classpath: string[];
  debug: boolean;
  detailedGCLogging: boolean;
  workerKind: string;
  workerCreationJson: string;
}

export interface IdeConstructor {
  new (client: EnterpriseClient): Ide;
}

export interface Ide {
  createConsole(config: ConsoleConfig): CancelablePromise<IdeConnection>;
  startWorker(config: ConsoleConfig): CancelablePromise<DhcConnectionDetails>;
}

export type ConsoleServerAddressType = {
  GROUP: string;
};
export type ConsoleServerAddress = {
  Type: ConsoleServerAddressType;
  host: string;
  name: string;
  port: number;
  type: string;
};

export type QueryInfoStatic = {
  EVENT_DISCONNECT: string;
  EVENT_PING_TIMEOUT: string;
  EVENT_PING: string;
};

export type EditableQueryInfo = Omit<
  BaseQueryInfo,
  | 'status'
  | 'runningVersion'
  | 'serial'
  | 'createWorkspaceData'
  | 'getTreeTable'
  | 'getTable'
  | 'getObject'
  | 'getFigure'
  | 'saveWorkspaceData'
> & {
  scriptCode: string;
  serial: string | null;
};

export type EnterpriseClientStatic = {
  EVENT_CONNECT: 'connect';
  EVENT_DISCONNECT: 'disconnect';
  EVENT_RECONNECT: 'reconnect';
  EVENT_RECONNECT_AUTH_FAILED: 'reconnectauthfailed';
  EVENT_CONFIG_ADDED: 'configadded';
  EVENT_CONFIG_REMOVED: 'configremoved';
  EVENT_CONFIG_UPDATED: 'configupdated';
  EVENT_REFRESH_TOKEN_UPDATED: 'refreshtokenupdated';

  LOGIN_TYPE_PASSWORD: 'password';
  LOGIN_TYPE_SAML: 'saml';
};

export type SaveQueriesResult = {
  serialIds: string[];
  errors: string[];
};

export interface ServerConfigValues {
  getValue(key: string): string;
  csvParserFormats: string[];
  dbAclWriterHost: string;
  dbAclWriterPort: number;
  gradleVersion: string;
  vcsVersion: string;
  javaVersion: string;
  hostName: string;
  mergeQueryTableDataServices: string[];
  systemName: string;
  systemType: string;
  systemColor: string;
  supportContact: string;
  supportDocs: string;
  settingsLogoConfigured: boolean;
  appPlugins: string[];
  systemBadge: boolean;
  systemBadgeEditable: boolean;
  timeZone: string;
  timeZoneEditable: boolean;
  jvmProfileDefault: string;
  showSearch: boolean;
  scriptSessionProviders: string[];
  decimalFormat: string;
  decimalFormatEditable: boolean;
  integerFormat: string;
  integerFormatEditable: boolean;
  truncateNumbersWithPound: boolean;
  truncateNumbersWithPoundEditable: boolean;
  restartQueryWhenRunningDefault: string;
  workerKinds: WorkerKind[];
  defaultWorkerKind: string;
  schemaValidatorClass: string;
  startWorkersAsSystemUser: boolean;
  supportedParquetCodecs: string[];
  validationTestTypes: string[];
  detailedGcLoggingParameters: string[];
  kubernetes: boolean;
  webgl: boolean;
  webglEditable: boolean;
}

export interface ApplyParametersResult {
  tables: string[];
  widgets: string[];
}

export interface ParameterizedQuery {
  applyParameters(
    params: Record<string, unknown>
  ): Promise<ApplyParametersResult>;
  getTable(tableName: string): Promise<DhType.Table>;
  getFigure(figureName: string): Promise<DhType.plot.Figure>;
  validateParameter(name: string, value: string[]): void;
  validateParameters(paramValueMap: Map<string, string[]>): void;
}

export type VariableTypeUnion =
  (typeof VariableType)[keyof typeof VariableType];

declare const VariableType: (typeof DhType)['VariableType'] &
  typeof ParameterizedQueryVariableType;

export type ImportSourceTypeOption = string & {
  readonly __brand: unique symbol;
};

declare class ImportSourceType {
  static readonly CSV: ImportSourceTypeOption;

  static readonly JDBC: ImportSourceTypeOption;

  static readonly XML: ImportSourceTypeOption;

  static readonly JSON: ImportSourceTypeOption;

  static readonly NONE: ImportSourceTypeOption;
}

export type EnterpriseDhType = typeof DhType & {
  Client: EnterpriseClientStatic & EnterpriseClientConstructor;
  RangeSet: DhType.RangeSet;
  Table: DhType.Table;
  parameterized: Parameterized;
  VariableType: typeof VariableType;
  ConsoleServerAddress: ConsoleServerAddress;
  Ide: IdeConstructor;
  ConsoleConfig: ConsoleConfigConstructor;
  QueryInfo: QueryInfoStatic;
  ImportSourceType: typeof ImportSourceType;
};
