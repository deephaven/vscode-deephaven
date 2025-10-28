import * as vscode from 'vscode';
import { TreeDataProviderBase } from './TreeDataProviderBase';
import type { MarkableWsTreeNode } from '../types';
import type { FilteredWorkspace } from '../services';
import { getMarkableWsTreeCheckBoxState } from '../util';

/**
 * Tree data provider that shows the Python modules in the workspace.
 */
export class RemoteImportSourceTreeProvider extends TreeDataProviderBase<MarkableWsTreeNode> {
  constructor(private readonly _pythonWorkspace: FilteredWorkspace) {
    super();

    this.disposables.add(
      this._pythonWorkspace.onDidUpdate(() => this.refresh())
    );
  }

  /**
   * Get the children of a given node, or the root nodes if no node is provided.
   * @param node The parent node, or undefined for root nodes.
   * @returns a Promise that resolves to an array of child nodes.
   */
  getChildren(
    node?: MarkableWsTreeNode | undefined
  ): vscode.ProviderResult<MarkableWsTreeNode[]> {
    if (node == null) {
      return this._pythonWorkspace.getChildNodes(null);
    }

    return this._pythonWorkspace
      .getChildNodes(node.uri)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get a TreeItem representation of a node.
   * @param node The node to get the TreeItem for.
   * @returns A TreeItem representing the node.
   */
  getTreeItem(node: MarkableWsTreeNode): vscode.TreeItem {
    return {
      label: node.name,
      checkboxState: node.isFile
        ? undefined
        : getMarkableWsTreeCheckBoxState(node.status),
      resourceUri: node.uri,
      collapsibleState: node.isFile
        ? vscode.TreeItemCollapsibleState.None
        : vscode.TreeItemCollapsibleState.Collapsed,
      command: node.isFile
        ? {
            // Standard VS Code behavior to open the file in the editor when clicked
            command: 'vscode.open',
            title: 'Open File',
            arguments: [node.uri],
          }
        : undefined,
    };
  }
}
