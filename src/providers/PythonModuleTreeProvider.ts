import * as vscode from 'vscode';
import { TreeDataProviderBase } from './TreeDataProviderBase';
import type { MarkableWsTreeNode } from '../types';
import type { FilteredWorkspace } from '../services';

export class PythonModuleTreeProvider extends TreeDataProviderBase<MarkableWsTreeNode> {
  constructor(private readonly _pythonWorkspace: FilteredWorkspace) {
    super();

    this.disposables.add(
      this._pythonWorkspace.onDidUpdate(() => this.refresh())
    );
  }

  getChildren(
    node?: MarkableWsTreeNode | undefined
  ): vscode.ProviderResult<MarkableWsTreeNode[]> {
    if (node == null) {
      return this._pythonWorkspace.getRootFolderNodes();
    }

    return this._pythonWorkspace
      .getChildNodes(node.uri)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getTreeItem(
    node: MarkableWsTreeNode
  ): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return {
      label: node.name,
      resourceUri: node.uri,
      collapsibleState: node.isFile
        ? vscode.TreeItemCollapsibleState.None
        : vscode.TreeItemCollapsibleState.Collapsed,
      contextValue: node.isFile
        ? undefined
        : `remoteFileSource.${node.marked ? 'marked' : 'unmarked'}`,
      command: node.isFile
        ? {
            command: 'vscode.open',
            title: 'Open File',
            arguments: [node.uri],
          }
        : undefined,
    };
  }
}
