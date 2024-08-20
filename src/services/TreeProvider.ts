import * as vscode from 'vscode';
import { ServerState, WorkerState } from '../common';
import { IWorkerManager } from './types';

/**
 * Base class for tree view data providers.
 */
export abstract class TreeProvider<T> implements vscode.TreeDataProvider<T> {
  constructor(readonly workerManager: IWorkerManager) {
    workerManager.onDidUpdate(() => {
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

    return {
      label: new URL(element.url).host,
      iconPath: new vscode.ThemeIcon(
        element.isRunning === true ? 'circle-large-filled' : 'circle-slash'
      ),
    };
  }

  getChildren(elementOrRoot?: ServerNode): vscode.ProviderResult<ServerNode[]> {
    // Root node
    if (elementOrRoot == null) {
      return [{ label: 'Running' }, { label: 'Stopped' }];
    }

    if (isServerGroupState(elementOrRoot)) {
      return this.workerManager
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
 * Provider for the worker tree view.
 */
export class WorkerTreeProvider extends TreeProvider<WorkerState> {
  getTreeItem(
    element: WorkerState
  ): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return {
      label: new URL(element.url).host,
      iconPath: new vscode.ThemeIcon('vm-connect'),
    };
  }

  getChildren(): vscode.ProviderResult<WorkerState[]> {
    return this.workerManager.getWorkers();
  }
}
