import * as vscode from 'vscode';
import type { FilePattern, FolderName, MarkableWsTreeNode } from '../types';
import { getWorkspaceFileUriMap, URIMap, URISet } from '../util';
import { DisposableBase } from './DisposableBase';

export const PYTHON_FILE_PATTERN = '**/*.py' as const;

const PYTHON_IGNORE_TOP_LEVEL_FOLDER_NAMES: Set<FolderName> =
  new Set<FolderName>([
    '.venv',
    'venv',
    'env',
    '.env',
    '__pycache__',
    '.git',
    '.mypy_cache',
    '.pytest_cache',
    '.tox',
    'build',
    'dist',
    '*.egg-info',
  ] as Array<FolderName>);

/**
 * Represents a filtered view of a VS Code workspace. Also supports "marking"
 * folders that can be used for an additional filter layer.
 */
export class FilteredWorkspace
  extends DisposableBase
  implements vscode.FileDecorationProvider
{
  constructor(readonly filePattern: FilePattern) {
    super();

    this.disposables.add(vscode.window.registerFileDecorationProvider(this));

    const watcher = vscode.workspace.createFileSystemWatcher(filePattern);
    this.disposables.add(watcher.onDidCreate(() => this._update()));
    this.disposables.add(watcher.onDidDelete(() => this._update()));
    this.disposables.add(watcher);

    // TODO: Load marked folders from storage

    this._update();
  }

  private _onDidChangeFileDecorations = new vscode.EventEmitter<
    vscode.Uri | vscode.Uri[] | undefined
  >();
  readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

  private _onDidUpdate = new vscode.EventEmitter<void>();
  readonly onDidUpdate = this._onDidUpdate.event;

  // TODO: Make this configurable
  private readonly _ignoreTopLevelFolderNames =
    PYTHON_IGNORE_TOP_LEVEL_FOLDER_NAMES;

  private readonly _childNodeMap = new URIMap<URIMap<MarkableWsTreeNode>>();
  private readonly _parentUriMap = new URIMap<vscode.Uri | null>();
  private readonly _nodeMap = new URIMap<MarkableWsTreeNode>();
  private readonly _rootNodeMap = new URIMap<MarkableWsTreeNode>();
  private _wsFileUriMap = new URIMap<URISet>();

  markFolder(folderUri: vscode.Uri): void {
    for (const node of this.iterateNodeTree(folderUri)) {
      node.marked = true;
    }

    this._onDidChangeFileDecorations.fire(undefined);
    this._onDidUpdate.fire();
  }

  // TODO: Make this smart enough to remove sub rules
  unmarkFolder(folderUri: vscode.Uri): void {
    for (const node of this.iterateNodeTree(folderUri)) {
      node.marked = false;
    }

    this._onDidChangeFileDecorations.fire(undefined);
    this._onDidUpdate.fire();
  }

  getChildNodes(parentUri: vscode.Uri | null): MarkableWsTreeNode[] {
    if (parentUri == null) {
      return [...this._rootNodeMap.values()];
    }

    const childMap = this._childNodeMap.get(parentUri);
    if (childMap == null) {
      return [];
    }

    return [...childMap.values()];
  }

  getTopLevelMarkedFolderUris(): URISet {
    const set = new URISet();

    const queue: MarkableWsTreeNode[] = [...this._rootNodeMap.values()].filter(
      n => n.marked
    );

    while (queue.length > 0) {
      const node = queue.shift()!;

      const childSet = this._childNodeMap.get(node.uri);
      if (childSet == null || childSet.size === 0) {
        continue;
      }

      const markedChildren = [...childSet.values()].filter(n => n.marked);

      // If all children are marked, and this isn't a workspace root, this is
      // considered a top-level marked folder
      if (
        markedChildren.length === childSet.size &&
        this._parentUriMap.get(node.uri) !== null
      ) {
        set.add(node.uri);
        continue;
      }

      queue.push(...markedChildren);
    }

    return set;
  }

  getWsFileUriMap(): URIMap<URISet> {
    return this._wsFileUriMap;
  }

  hasChildNodes(parentUri: vscode.Uri): boolean {
    return this._childNodeMap.has(parentUri);
  }

  isMarked(uri: vscode.Uri): boolean {
    const node = this._nodeMap.get(uri);
    if (node == null) {
      return false;
    }

    return node.marked === true;
  }

  *iterateNodeTree(rootUri: vscode.Uri): Iterable<MarkableWsTreeNode> {
    const queue: vscode.Uri[] = [rootUri];

    while (queue.length > 0) {
      const currentUri = queue.shift()!;
      const currentNode = this._nodeMap.get(currentUri);

      if (currentNode == null) {
        continue;
      }

      yield currentNode;

      const childMap = this._childNodeMap.get(currentUri);
      if (childMap == null || childMap.size === 0) {
        continue;
      }

      queue.push(...childMap.keys());
    }
  }

  /**
   * Provide decorations for a given uri if it is included in a marked folder.
   * @param uri The uri to provide decoration for.
   * @param _token
   * @returns A FileDecoration if the uri is decorated, otherwise undefined.
   */
  provideFileDecoration(
    uri: vscode.Uri,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.FileDecoration> {
    if (!this.isMarked(uri)) {
      return;
    }

    return new vscode.FileDecoration(
      '\u{25AA}',
      'Deephaven source',
      new vscode.ThemeColor('charts.green')
    );
  }

  private _updateNodeMaps(
    parentUri: vscode.Uri | null,
    uri: vscode.Uri,
    node: MarkableWsTreeNode
  ): void {
    this._parentUriMap.set(uri, parentUri);
    this._nodeMap.set(uri, node);

    if (parentUri == null) {
      this._rootNodeMap.set(uri, node);
    } else {
      if (!this._childNodeMap.has(parentUri)) {
        this._childNodeMap.set(parentUri, new URIMap());
      }
      const childMap = this._childNodeMap.get(parentUri)!;
      childMap.set(uri, node);
    }
  }

  private async _update(): Promise<void> {
    // Store a map of just the filtered files in the workspace
    this._wsFileUriMap = await getWorkspaceFileUriMap(
      this.filePattern,
      this._ignoreTopLevelFolderNames
    );

    this._rootNodeMap.clear();
    this._parentUriMap.clear();
    this._nodeMap.clear();
    this._childNodeMap.clear();

    for (const [wsUri, fileUris] of this._wsFileUriMap.entries()) {
      // If workspace folder has no files, skip it
      if (fileUris.size === 0) {
        continue;
      }

      const ws = vscode.workspace.getWorkspaceFolder(wsUri);
      if (ws == null) {
        continue;
      }

      this._updateNodeMaps(null, wsUri, {
        uri: wsUri,
        name: ws.name,
        marked: this.isMarked(wsUri),
      });

      for (const fileUri of fileUris.keys()) {
        const tokens = vscode.workspace
          .asRelativePath(fileUri, false)
          .split('/');

        if (tokens.length < 2) {
          // Ignore files directly under the workspace folders
          continue;
        }

        // traverse each path token starting at the workspace folder down to the
        // file and update the node maps
        let parentUri = wsUri;
        for (const token of tokens) {
          const uri = vscode.Uri.joinPath(parentUri, token);

          this._updateNodeMaps(parentUri, uri, {
            uri,
            isFile: uri.fsPath === fileUri.fsPath,
            marked: this.isMarked(uri),
            name: token,
          });

          parentUri = uri;
        }
      }
    }

    this._onDidChangeFileDecorations.fire(undefined);
    this._onDidUpdate.fire();
  }
}
