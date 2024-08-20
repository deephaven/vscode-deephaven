import * as vscode from 'vscode';
import { CAN_CREATE_CONNECTION_CONTEXT, ServerState, ICON_ID } from '../common';
import { IDhService, IServerManager } from './types';

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
      description: element.type === 'DHC' ? undefined : 'Enterprise',
      contextValue:
        isRunning &&
        element.type === 'DHC' &&
        !this.serverManager.hasConnection(element.url)
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
export class ServerConnectionTreeProvider extends TreeProvider<IDhService> {
  async getTreeItem(element: IDhService): Promise<vscode.TreeItem> {
    const consoleType = element.isInitialized
      ? (await element.getConsoleTypes())[0]
      : undefined;

    return {
      label: new URL(element.serverUrl).host,
      description: consoleType,
      iconPath: new vscode.ThemeIcon(
        element.isInitialized ? ICON_ID.connected : ICON_ID.connecting
      ),
    };
  }

  getChildren(): vscode.ProviderResult<IDhService[]> {
    return this.serverManager
      .getConnections()
      .sort((a, b) => a.serverUrl.localeCompare(b.serverUrl));
  }
}
