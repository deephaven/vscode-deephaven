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

export type ServerConnectionNode = ServerState | ConnectionState | vscode.Uri;

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
 * A node in the Persistent Queries tree:
 * - `ServerState`: a DHE server grouping its persistent queries.
 * - `PersistentQueryNode`: a non-InteractiveConsole PQ (expandable to objects).
 * - `[URL, VariableDefintion]`: an exported object leaf (worker URL + variable),
 *   rendered/opened exactly like the Panels tree's object leaves.
 */
export type PersistentQueryTreeNode =
  | ServerState
  | PersistentQueryNode
  | [URL, VariableDefintion];

export interface PersistentQueryTreeView
  extends vscode.TreeView<PersistentQueryTreeNode> {}
