import * as vscode from 'vscode';
import type { IDhService } from './serviceTypes';
import type { ServerState, VariableDefintion } from './commonTypes';

export type ServerGroupState = 'Managed' | 'Running' | 'Stopped';
export type ServerNode = ServerGroupState | ServerState;
export interface ServerTreeView extends vscode.TreeView<ServerNode> {}

export type ServerConnectionNode = IDhService | vscode.Uri;
export interface ServerConnectionTreeView
  extends vscode.TreeView<ServerConnectionNode> {}

export type ServerConnectionPanelNode = IDhService | VariableDefintion;
export interface ServerConnectionPanelTreeView
  extends vscode.TreeView<ServerConnectionPanelNode> {}
