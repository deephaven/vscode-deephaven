import * as vscode from 'vscode';
import {
  CAN_CREATE_CONNECTION_CONTEXT,
  ServerState,
  ServerConnectionState,
  ICON_ID,
} from '../common';
import { IServerManager } from './types';

/**
 * Base class for tree view data providers.
 */
export abstract class TreeProvider<T> implements vscode.TreeDataProvider<T> {
  constructor(readonly serverManager: IServerManager) {
    serverManager.onDidUpdate(() => {
      this._onDidChangeTreeData.fire();
    });
  }

  private _onDidChangeTreeData = new vscode.EventEmitter<
    T | undefined | void
  >();

  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  abstract getTreeItem(element: T): vscode.TreeItem | Thenable<vscode.TreeItem>;

  abstract getChildren(element?: T | undefined): vscode.ProviderResult<T[]>;
}

type ServerGroupState = { label: string };
type ServerNode = ServerGroupState | ServerState;

function isServerGroupState(node: ServerNode): node is ServerGroupState {
  return 'label' in node;
}

/**
 * Provider for the server tree view.
 */
export class ServerTreeProvider extends TreeProvider<ServerNode> {
  getTreeItem(
    element: ServerNode
  ): vscode.TreeItem | Thenable<vscode.TreeItem> {
    if (isServerGroupState(element)) {
      return {
        label: element.label,
        iconPath: new vscode.ThemeIcon('server'),
        collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      };
    }

    const isRunning = element.isRunning ?? false;

    return {
      label: new URL(element.url).host,
      contextValue:
        isRunning && element.type === 'DHC'
          ? CAN_CREATE_CONNECTION_CONTEXT
          : '',
      iconPath: new vscode.ThemeIcon(
        isRunning ? 'circle-large-filled' : 'circle-slash'
      ),
    };
  }

  getChildren(elementOrRoot?: ServerNode): vscode.ProviderResult<ServerNode[]> {
    // Root node
    if (elementOrRoot == null) {
      return [{ label: 'Running' }, { label: 'Stopped' }];
    }

    if (isServerGroupState(elementOrRoot)) {
      return this.serverManager
        .getServers()
        .filter(server =>
          (elementOrRoot as ServerGroupState).label === 'Running'
            ? server.isRunning
            : !server.isRunning
        );
    }
  }
}

/**
 * Provider for the server connection tree view.
 */
export class ServerConnectionTreeProvider extends TreeProvider<ServerConnectionState> {
  getTreeItem(
    element: ServerConnectionState
  ): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return {
      label: new URL(element.url).host,
      iconPath: new vscode.ThemeIcon(ICON_ID.connected),
    };
  }

  getChildren(): vscode.ProviderResult<ServerConnectionState[]> {
    return this.serverManager.getConnections();
  }
}
