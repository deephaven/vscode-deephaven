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

  getChildren(
    node?: PythonModuleTreeNode | undefined
  ): vscode.ProviderResult<PythonModuleTreeNode[]> {
    if (node == null) {
      return [...this._rootChildNodeCache].filter(n =>
        this._childNodeCache.has(n.uri)
      );
    }

    return this._childNodeCache.get(node.uri) ?? [];
  }

  getTreeItem(
    node: PythonModuleTreeNode
  ): vscode.TreeItem | Thenable<vscode.TreeItem> {
    const isTopLevelModuleFolder =
      node.moduleName != null && this._childNodeCache.has(node.uri);

    const isFile =
      node.moduleName != null && !this._childNodeCache.has(node.uri);

    return {
      label: node.moduleName ?? basename(node.uri.fsPath),
      resourceUri: node.uri,
      collapsibleState: this._childNodeCache.has(node.uri)
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
      contextValue: isTopLevelModuleFolder
        ? `topLevelPythonModule.${node.include ? 'included' : 'excluded'}`
        : 'pythonModuleWorkspaceFolder',
      command: isFile
        ? {
            command: 'vscode.open',
            title: 'Open File',
            arguments: [node.uri],
          }
        : undefined,
    };
  }

  override refresh(): void {
    this._updateNodeCaches();
    super.refresh();
  }

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

      const wsChildNodes: PythonModuleTreeNode[] = [];

      const sortedTopLevelModuleNames = [...topLevelModuleNames.entries()].sort(
        (a, b) => a[0].localeCompare(b[0])
      );

      for (const [
        topLevelModuleName,
        { include },
      ] of sortedTopLevelModuleNames) {
        wsChildNodes.push({
          uri: vscode.Uri.joinPath(wsUri, topLevelModuleName),
          include,
          moduleName: topLevelModuleName,
        });
      }

      this._childNodeCache.set(wsUri, wsChildNodes);

      const wsPythonModules = moduleMeta.moduleMap.get(wsUri);
      if (wsPythonModules == null) {
        continue;
      }

      const sortedModules = [...wsPythonModules.entries()].sort((a, b) =>
        a[0].localeCompare(b[0])
      );

      for (const [moduleName, { value: uri, include }] of sortedModules) {
        const relativePath = vscode.workspace.asRelativePath(uri, false);
        const parentPath = vscode.Uri.joinPath(
          wsUri,
          relativePath.split('/')[0]
        );

        if (!this._childNodeCache.has(parentPath)) {
          this._childNodeCache.set(parentPath, []);
        }
        const childNodes = this._childNodeCache.getOrThrow(parentPath);

        childNodes.push({
          uri,
          include,
          moduleName,
        });
      }
    }
  }
}
