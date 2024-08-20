import * as vscode from 'vscode';
import type { IDhService } from '../types';
import type { ServerState } from '../../common';

export type ServerGroupState = { label: string };
export type ServerNode = ServerGroupState | ServerState;
export interface ServerTreeView extends vscode.TreeView<ServerNode> {}

export type ServerConnectionNode = IDhService | vscode.Uri;
export interface ServerConnectionTreeView
  extends vscode.TreeView<ServerConnectionNode> {}
