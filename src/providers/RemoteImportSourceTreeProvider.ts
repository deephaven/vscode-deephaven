import * as vscode from 'vscode';
import { TreeDataProviderBase } from './TreeDataProviderBase';
import type { FilteredWorkspace } from '../services';
import type { RemoteImportSourceTreeElement } from '../types';
import {
  getFileTreeItem,
  getFolderTreeItem,
  getTopLevelMarkedFolderTreeItem,
} from '../util';

const ACTIVE_SOURCES_LABEL = 'ACTIVE SOURCES';
const WORKSPACE_LABEL = 'WORKSPACE';

/**
 * Tree data provider that shows the Python modules in the workspace.
 */
export class RemoteImportSourceTreeProvider extends TreeDataProviderBase<RemoteImportSourceTreeElement> {
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
    node?: RemoteImportSourceTreeElement | undefined
  ): vscode.ProviderResult<RemoteImportSourceTreeElement[]> {
    if (node == null) {
      return [
        { type: 'root', name: ACTIVE_SOURCES_LABEL },
        { type: 'root', name: WORKSPACE_LABEL },
      ];
    }

    if (node.type === 'root') {
      if (node.name === ACTIVE_SOURCES_LABEL) {
        return this._pythonWorkspace.getTopLevelMarkedFolders();
      }

      return this._pythonWorkspace.getChildNodes(null);
    }

    return this._pythonWorkspace
      .getChildNodes(node.uri)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get a TreeItem representation of an element.
   * @param element The element to get the TreeItem for.
   * @returns A TreeItem representing the element.
   */
  getTreeItem(element: RemoteImportSourceTreeElement): vscode.TreeItem {
    if (element.type === 'topLevelMarkedFolder') {
      return getTopLevelMarkedFolderTreeItem(element);
    }

    if (element.type === 'folder') {
      return getFolderTreeItem(element);
    }

    if (element.type === 'file') {
      return getFileTreeItem(element);
    }

    return {
      label: element.name,
      collapsibleState:
        element.type === 'root'
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed,
    };
  }
}
