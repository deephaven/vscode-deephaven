import * as vscode from 'vscode';
import { TreeDataProviderBase } from './TreeDataProviderBase';
import type { IncludableWsTreeNode } from '../types';
import type { FilePatternWorkspace } from '../services';

export class PythonModuleTreeProvider extends TreeDataProviderBase<IncludableWsTreeNode> {
  constructor(private readonly _pythonWorkspace: FilePatternWorkspace) {
    super();

    this.disposables.add(
      this._pythonWorkspace.onDidUpdate(() => this.refresh())
    );
  }

  getChildren(
    node?: IncludableWsTreeNode | undefined
  ): vscode.ProviderResult<IncludableWsTreeNode[]> {
    if (node == null) {
      return this._pythonWorkspace.getRootFolderNodes();
    }

    return this._pythonWorkspace
      .getChildNodes(node.uri)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getTreeItem(
    node: IncludableWsTreeNode
  ): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return {
      label: node.name,
      resourceUri: node.uri,
      collapsibleState: node.isFile
        ? vscode.TreeItemCollapsibleState.None
        : vscode.TreeItemCollapsibleState.Collapsed,
      contextValue: node.isFile
        ? undefined
        : `remoteFileSource.${node.include ? 'included' : 'excluded'}`,
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
