import * as vscode from 'vscode';
import type { QueryInfo } from '@deephaven-enterprise/jsapi-types';
import type {
  ConnectionState,
  ServerState,
  VariableDefintion,
} from './commonTypes';

export type ServerGroupState = 'Managed' | 'Running' | 'Stopped';
export type ServerNode = ServerGroupState | ServerState;
export interface ServerTreeView extends vscode.TreeView<ServerNode> {}

/**
 * A node in the Interactive Consoles tree:
 * - `ServerState`: a server grouping its console workers.
 * - `ConnectionState`: a console worker connection.
 * - `vscode.Uri`: an editor file associated with the worker.
 * - `[URL, VariableDefintion]`: a panel leaf (worker URL + variable).
 */
export type ServerConnectionNode =
  | ServerState
  | ConnectionState
  | vscode.Uri
  | [URL, VariableDefintion];

export interface ServerConnectionTreeView
  extends vscode.TreeView<ServerConnectionNode> {}

/**
 * A node in the Panels tree:
 * - `ServerState`: a server grouping its console workers + persistent queries.
 * - `ConnectionState`: a console worker connection (panels come from its session).
 * - `PersistentQueryNode`: a PQ whose exported objects can be opened.
 * - `[URL, VariableDefintion]`: a panel / object leaf.
 */
export type ServerConnectionPanelNode =
  | ServerState
  | ConnectionState
  | PersistentQueryNode
  | [URL, VariableDefintion];

export interface ServerConnectionPanelTreeView
  extends vscode.TreeView<ServerConnectionPanelNode> {}

/**
 * A persistent-query node in the Persistent Queries tree. Pairs the owning DHE
 * server URL with the `QueryInfo` so the provider can resolve the PQ's worker
 * (via `getKnownConfigs()`) and its exported objects on expand.
 */
export type PersistentQueryNode = {
  readonly dheServerUrl: URL;
  readonly queryInfo: QueryInfo;
};

/**
 * The status groups a server's persistent queries are bucketed into. `Stopped`
 * holds the terminal (and unset) statuses; `Running` holds `Running` plus the
 * transitional ones.
 */
export type PersistentQueryGroup = 'Running' | 'Stopped';

/**
 * A status group node in the Persistent Queries tree, pairing the owning DHE
 * server URL with the group so the provider can list that group's queries.
 */
export type PersistentQueryGroupNode = {
  readonly dheServerUrl: URL;
  readonly group: PersistentQueryGroup;
};

/**
 * A node in the Persistent Queries tree:
 * - `ServerState`: a DHE server grouping its persistent queries.
 * - `PersistentQueryGroupNode`: a `Running` / `Stopped` status group.
 * - `PersistentQueryNode`: a non-InteractiveConsole PQ (expandable to objects).
 * - `[URL, VariableDefintion]`: an exported object leaf (worker URL + variable),
 *   rendered/opened exactly like the Panels tree's object leaves.
 */
export type PersistentQueryTreeNode =
  | ServerState
  | PersistentQueryGroupNode
  | PersistentQueryNode
  | [URL, VariableDefintion];

export interface PersistentQueryTreeView
  extends vscode.TreeView<PersistentQueryTreeNode> {}
