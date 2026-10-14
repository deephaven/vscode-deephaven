import * as vscode from 'vscode';
import { TreeDataProviderBase } from './TreeDataProviderBase';
import { CONFIG_KEY } from '../common';
import type { FilteredWorkspace } from '../services';
import type {
  GroovyPackageName,
  IConfigService,
  PythonModuleFullname,
  RemoteImportSourceTreeElement,
} from '../types';
import {
  getFileTreeItem,
  getFolderTreeItem,
  getLanguageRootTreeItem,
  getRootTreeItem,
  getTopLevelMarkedFolderTreeItem,
  getWorkspaceFolderRootTreeItem,
  sortByStringProp,
} from '../util';

const ACTIVE_SOURCES_LABEL = 'Active Sources';
const WORKSPACE_LABEL = 'Workspace';
const GROOVY_LABEL = 'Groovy';
const PYTHON_LABEL = 'Python';

/**
 * Tree data provider that shows the Python modules in the workspace.
 */
export class RemoteImportSourceTreeProvider extends TreeDataProviderBase<RemoteImportSourceTreeElement> {
  constructor(
    private readonly _config: IConfigService,
    private readonly _groovyWorkspace: FilteredWorkspace<GroovyPackageName>,
    private readonly _pythonWorkspace: FilteredWorkspace<PythonModuleFullname>
  ) {
    super();

    this.disposables.add(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (
          e.affectsConfiguration(
            `${CONFIG_KEY.root}.${CONFIG_KEY.experimentalGroovyRemoteFileSourcing}`
          )
        ) {
          this.refresh();
        }
      })
    );

    this.disposables.add(
      this._groovyWorkspace.onDidUpdate(() => this.refresh())
    );

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
      const isGroovyEnabled = this._config.isGroovyRemoteFileSourcingEnabled();

      if (node.name === ACTIVE_SOURCES_LABEL) {
        return [
          ...(isGroovyEnabled
            ? this._groovyWorkspace.getTopLevelMarkedFolders()
            : []),
          ...this._pythonWorkspace.getTopLevelMarkedFolders(),
        ].sort(sortByStringProp('name'));
      }

      if (node.name === WORKSPACE_LABEL) {
        return [
          ...(isGroovyEnabled
            ? [
                {
                  type: 'languageRoot',
                  name: GROOVY_LABEL,
                  languageId: 'groovy',
                } as const,
              ]
            : []),
          { type: 'languageRoot', name: PYTHON_LABEL, languageId: 'python' },
        ];
      }

      throw new Error(`Unknown root node name: ${node.name}`);
    }

    if (node.type === 'languageRoot') {
      return node.languageId === 'groovy'
        ? this._groovyWorkspace.getChildNodes(null)
        : this._pythonWorkspace.getChildNodes(null);
    }

    const workspace =
      node.languageId === 'groovy'
        ? this._groovyWorkspace
        : this._pythonWorkspace;

    return workspace.getChildNodes(node.uri).sort(
      (nodeA, nodeB) =>
        // Sort folders before files, then by name
        nodeB.type.localeCompare(nodeA.type) ||
        nodeA.name.localeCompare(nodeB.name)
    );
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

    if (element.type === 'workspaceRootFolder') {
      return getWorkspaceFolderRootTreeItem(element);
    }

    if (element.type === 'languageRoot') {
      return getLanguageRootTreeItem(element);
    }

    return getRootTreeItem(element);
  }
}
