import * as vscode from 'vscode';
import type { IServerManager } from '../types';

/**
 * Base class for tree view data providers.
 */
export abstract class TreeDataProviderBase<T>
  implements vscode.TreeDataProvider<T>
{
  constructor(serverManager: IServerManager) {
    this.serverManager = serverManager;

    this.serverManager.onDidUpdate(() => {
      this._onDidChangeTreeData.fire();
    });
  }

  protected readonly serverManager: IServerManager;

  protected readonly _onDidChangeTreeData = new vscode.EventEmitter<
    T | undefined | void
  >();

  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  abstract getTreeItem(element: T): vscode.TreeItem | Thenable<vscode.TreeItem>;

  abstract getChildren(element?: T | undefined): vscode.ProviderResult<T[]>;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}
