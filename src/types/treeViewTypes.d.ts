import * as vscode from 'vscode';
import type { IDhService } from './serviceTypes';
import type { ServerState } from './commonTypes';

export type ServerGroupState = 'Running' | 'Stopped';
export type ServerNode = ServerGroupState | ServerState;
export interface ServerTreeView extends vscode.TreeView<ServerNode> {}

export type ServerConnectionNode = IDhService | vscode.Uri;
export interface ServerConnectionTreeView
  extends vscode.TreeView<ServerConnectionNode> {}
