import * as vscode from 'vscode';
import type {
  ConnectionState,
  ServerState,
  VariableDefintion,
} from './commonTypes';
import type { ModuleFullname } from './remoteFileSourceTypes';

export type ServerGroupState = 'Managed' | 'Running' | 'Stopped';
export type ServerNode = ServerGroupState | ServerState;
export interface ServerTreeView extends vscode.TreeView<ServerNode> {}

export type ServerConnectionNode = ConnectionState | vscode.Uri;
export interface ServerConnectionTreeView
  extends vscode.TreeView<ServerConnectionNode> {}

export type ServerConnectionPanelNode =
  | ConnectionState
  | [URL, VariableDefintion];
export interface ServerConnectionPanelTreeView
  extends vscode.TreeView<ServerConnectionPanelNode> {}

export type MarkStatus = 'marked' | 'unmarked' | 'mixed';
export type MarkableWsTreeNode = {
  uri: vscode.Uri;
  status: MarkStatus;
  isFile?: boolean;
  name: string;
};
export interface PythonModuleTreeView
  extends vscode.TreeView<MarkableWsTreeNode> {}
