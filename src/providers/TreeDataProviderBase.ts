import * as vscode from 'vscode';
import type { IDisposable } from '../types';
import { DisposableBase } from '../services';

/**
 * Base class for tree view data providers.
 */
export abstract class TreeDataProviderBase<T>
  extends DisposableBase
  implements vscode.TreeDataProvider<T>
{
  constructor() {
    super();
    this.disposables.add(this._onDidChangeTreeData);
  }

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
