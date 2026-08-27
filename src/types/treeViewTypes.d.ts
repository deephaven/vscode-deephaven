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
