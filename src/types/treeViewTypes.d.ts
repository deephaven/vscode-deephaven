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
 * A persistent-query node in the Persistent Queries tree. Pairs the owning DHE
 * server URL with the `QueryInfo` so the provider can resolve the PQ's worker
 * (via `getKnownConfigs()`) and its exported objects on expand.
 */
export type PersistentQueryNode = {
  readonly dheServerUrl: URL;
  readonly queryInfo: QueryInfo;
};

/**
 * The trailing node under a server whose status filter is hiding queries. It
 * states how many are hidden and opens the filter picker when clicked, so the
 * hidden ones are never a silent omission.
 */
export type PersistentQueryHiddenNode = {
  readonly dheServerUrl: URL;
  readonly hiddenCount: number;
};

/**
 * A node in the Persistent Queries tree:
 * - `ServerState`: a DHE server grouping its persistent queries.
 * - `PersistentQueryNode`: a non-InteractiveConsole PQ (expandable to objects).
 * - `PersistentQueryHiddenNode`: the trailing "N hidden" node, when filtered.
 * - `[URL, VariableDefintion]`: an exported object leaf (worker URL + variable),
 *   rendered and opened exactly like the Interactive Consoles tree's panel
 *   leaves.
 */
export type PersistentQueryTreeNode =
  | ServerState
  | PersistentQueryNode
  | PersistentQueryHiddenNode
  | [URL, VariableDefintion];

export interface PersistentQueryTreeView
  extends vscode.TreeView<PersistentQueryTreeNode> {}
