import * as vscode from 'vscode';
import { basename } from 'node:path';
import { TreeDataProviderBase } from './TreeDataProviderBase';
import type { PythonModuleTreeNode } from '../types';
import type { LocalExecutionService } from '../services';
import { URIMap } from '../util';

export class PythonModuleTreeProvider extends TreeDataProviderBase<PythonModuleTreeNode> {
  constructor(localExecutionService: LocalExecutionService) {
    super();
    this._localExecutionService = localExecutionService;

    this.disposables.add(
      this._localExecutionService.onDidUpdateModuleMeta(() => this.refresh())
    );
  }

  private readonly _rootChildNodeCache = new Set<PythonModuleTreeNode>();
  private readonly _childNodeCache = new URIMap<PythonModuleTreeNode[]>();
  private readonly _localExecutionService: LocalExecutionService;

  private _updateNodeCaches(): void {
    this._rootChildNodeCache.clear();
    this._childNodeCache.clear();

    const moduleMeta = this._localExecutionService.getModuleMeta();
    if (moduleMeta == null) {
      return;
    }

    const workspaceFolderUris = vscode.workspace.workspaceFolders?.map(
      ws => ws.uri
    );
    if (workspaceFolderUris == null) {
      return;
    }

    for (const wsUri of workspaceFolderUris) {
      const workspaceNode: PythonModuleTreeNode = {
        uri: wsUri,
      };
      this._rootChildNodeCache.add(workspaceNode);

      const topLevelModuleNames = moduleMeta.topLevelModuleNames.get(wsUri);
      if (topLevelModuleNames == null) {
        continue;
      }

      const childNodes: PythonModuleTreeNode[] = [];

      const sortedTopLevelModuleNaames = [
        ...topLevelModuleNames.entries(),
      ].sort((a, b) => a[0].localeCompare(b[0]));

      for (const [
        topLevelModuleName,
        { include },
      ] of sortedTopLevelModuleNaames) {
        const childNode: PythonModuleTreeNode = {
          uri: vscode.Uri.joinPath(wsUri, topLevelModuleName),
          include,
          topLevelModuleName,
        };
        childNodes.push(childNode);
      }

      this._childNodeCache.set(wsUri, childNodes);
    }
  }

  getTreeItem(
    node: PythonModuleTreeNode
  ): vscode.TreeItem | Thenable<vscode.TreeItem> {
    const isTopLevelModuleFolder = node.topLevelModuleName != null;

    return {
      label: basename(node.uri.fsPath),
      resourceUri: node.uri,
      collapsibleState: isTopLevelModuleFolder
        ? vscode.TreeItemCollapsibleState.None
        : vscode.TreeItemCollapsibleState.Collapsed,
      contextValue: isTopLevelModuleFolder
        ? `topLevelPythonModule.${node.include ? 'included' : 'excluded'}`
        : 'pythonModuleWorkspaceFolder',
    };
  }

  getChildren(
    node?: PythonModuleTreeNode | undefined
  ): vscode.ProviderResult<PythonModuleTreeNode[]> {
    if (node == null) {
      return [...this._rootChildNodeCache];
    }

    return this._childNodeCache.get(node.uri) ?? [];
  }

  override refresh(): void {
    this._updateNodeCaches();
    super.refresh();
  }
}
