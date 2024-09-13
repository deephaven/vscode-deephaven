import type { dh } from '@deephaven/jsapi-types';
import type {
  ConsoleServerAddress,
  QueryConfigurationType,
  QueryConstants,
} from './Iris';

/** Copied from @deephaven/redux to avoid the dependency */
export interface UserPermissions {
  canUsePanels: boolean;
  canCopy: boolean;
  canDownloadCsv: boolean;
  canLogout: boolean;
}
/** Copied from @deephaven/redux to avoid the dependency */
export interface User {
  permissions: UserPermissions;
  name: string;
  operateAs?: string;
  groups: string[];
  displayName?: string;
  fullName?: string;
  image?: string;
}

export type EnterpriseUserPermissions = {
  /** Is an ACL editor user */
  isACLEditor: boolean;

  /** Is a super user */
  isSuperUser: boolean;

  /** Only the summary view of queries is visible, and cannot create code studios */
  isQueryViewOnly: boolean;

  /** Not allowed to use the web UI at all */
  isNonInteractive: boolean;

  /** Can use the Panels menu to select panels to add to a dashboard */
  canUsePanels: boolean;

  /** Can create new dashboards */
  canCreateDashboard: boolean;

  /** Can create/use code studios */
  canCreateCodeStudio: boolean;

  /** Can create/use query monitor */
  canCreateQueryMonitor: boolean;

  /** Can copy table data using keyboard shortcuts or context menu */
  canCopy: boolean;

  /** Can download/export table data as CSV */
  canDownloadCsv: boolean;

  /** Can share dashboards with other users */
  canShareDashboards: boolean;

  /** Can view the list of users a dashboard is shared with for a dashboard they are a viewer of */
  canViewDashboardSharedUsers: boolean;

  /** Can share queries with other users */
  canShareQueries: boolean;

  /** Can view the list of users a query is shared with for a query they are a viewer of */
  canViewQuerySharedUsers: boolean;

  /** Can logout */
  canLogout: boolean;
};

export type EnterpriseUser = User & {
  operateAs: string;
  permissions: EnterpriseUserPermissions;
};

export type QueryVariableDescriptor = dh.ide.VariableDescriptor & {
  querySerial: string;
  query?: string;
};

/**
 * @deprecated use QueryVariableDescriptor instead
 */
export type LegacyQueryVariableDescriptor = {
  querySerial: string;
  query: string;
};

/** In some cases such as a console panel, we may not have a descriptor but still want to fetch the deferred API. */
export type UnknownVariableDescriptor = dh.ide.VariableDescriptor & {
  type: 'unknown';
};

export type SessionVariableDescriptor = dh.ide.VariableDescriptor & {
  sessionId: string;
};

export type EnterpriseVariableDescriptor =
  | QueryVariableDescriptor
  | SessionVariableDescriptor;

export type ControllerQueryConstants = {
  getMaxHeapGbForServer: (name: string) => number;
  consoleDefaultHeap: number;
};

export type ControllerConfiguration = {
  readonly consoleServers: readonly ConsoleServerAddress[];
  readonly dbServers: readonly ConsoleServerAddress[];
  readonly queryTypes: ReadonlyMap<string, string>;
  readonly jvmProfiles: readonly string[];
  readonly queryConstants: QueryConstants;
  readonly businessCalendars: readonly string[];
  readonly temporaryQueryTypes: readonly string[];
  readonly jvmProfileDefault: string;
  readonly scriptQueryTypes: readonly string[];
  readonly queryConfigurationTypes: ReadonlyMap<string, QueryConfigurationType>;
};

export declare const PROTOCOL: Readonly<{
  COMMUNITY: 'Community';
  ENTERPRISE_WEBSOCKET: 'EnterpriseWebsocket';
  ENTERPRISE_COMM: 'EnterpriseComm';
}>;

export interface WorkerKind {
  readonly description: string;
  readonly name: string;
  readonly protocols: (typeof PROTOCOL)[keyof typeof PROTOCOL][];
  readonly title: string;
  // eslint-disable-next-line camelcase
  readonly worker_control: readonly string[];
  // eslint-disable-next-line camelcase
  readonly ephemeral_venv: boolean;
}
