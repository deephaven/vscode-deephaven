import * as vscode from 'vscode';
import type {
  FilePattern,
  FolderName,
  MarkableWsTreeNode,
  MarkStatus,
} from '../types';
import { getWorkspaceFileUriMap, URIMap, URISet } from '../util';
import { DisposableBase } from './DisposableBase';

export const PYTHON_FILE_PATTERN = '**/*.py' as const;

// TODO: This should be configurable DH-20662
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
    this.disposables.add(watcher.onDidCreate(() => this.refresh()));
    this.disposables.add(watcher.onDidDelete(() => this.refresh()));
    this.disposables.add(watcher);

    // TODO: Load marked folders from storage DH-20573

    this.refresh();
  }

  private _onDidChangeFileDecorations = new vscode.EventEmitter<
    vscode.Uri | vscode.Uri[] | undefined
  >();
  readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

  private _onDidUpdate = new vscode.EventEmitter<void>();
  readonly onDidUpdate = this._onDidUpdate.event;

  private readonly _ignoreTopLevelFolderNames =
    PYTHON_IGNORE_TOP_LEVEL_FOLDER_NAMES;

  private readonly _childNodeMap = new URIMap<URIMap<MarkableWsTreeNode>>();
  private readonly _parentUriMap = new URIMap<vscode.Uri | null>();
  private readonly _nodeMap = new URIMap<MarkableWsTreeNode>();
  private readonly _rootNodeMap = new URIMap<MarkableWsTreeNode>();
  private _wsFileUriMap = new URIMap<URISet>();

  /**
   * Mark a folder and all its children. Will also update parent folders if the
   * changes cause a status change.
   * @param folderUri The folder URI to mark.
   */
  markFolder(folderUri: vscode.Uri): void {
    for (const node of this.iterateNodeTree(folderUri)) {
      node.status = 'marked';
    }

    this._updateAncestorMarkStatus(folderUri);

    this._onDidChangeFileDecorations.fire(undefined);
    this._onDidUpdate.fire();
  }

  /**
   * Unmark a folder and all its children. Will also update parent folders if
   * the changes cause a status change.
   * @param folderUri The folder URI to unmark.
   */
  unmarkFolder(folderUri: vscode.Uri): void {
    for (const node of this.iterateNodeTree(folderUri)) {
      node.status = 'unmarked';
    }

    this._updateAncestorMarkStatus(folderUri);

    this._onDidChangeFileDecorations.fire(undefined);
    this._onDidUpdate.fire();
  }

  /**
   * Get the child nodes for a given parent URI, or the root nodes if parentUri is null.
   * @param parentUri The parent URI to get child nodes for, or null for root nodes.
   * @returns An array of child nodes.
   */
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

  /**
   * Get the URIs of top-level marked folders. A top-level marked folder is a
   * folder where all its children are marked, and it is not a workspace root.
   * @returns The set of URIs of top-level marked folders.
   */
  getTopLevelMarkedFolderUris(): URISet {
    const set = new URISet();

    const queue: MarkableWsTreeNode[] = [...this._rootNodeMap.values()].filter(
      n => n.status !== 'unmarked'
    );

    while (queue.length > 0) {
      const node = queue.shift()!;

      const childSet = this._childNodeMap.get(node.uri);
      if (childSet == null || childSet.size === 0) {
        continue;
      }

      const markedChildren = [...childSet.values()].filter(
        n => n.status !== 'unmarked'
      );

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

  /**
   * Get the map of workspace folder URIs to filtered file URIs.
   * @returns The URI map of workspace folder URIs to filtered file URIs.
   */
  getWsFileUriMap(): URIMap<URISet> {
    return this._wsFileUriMap;
  }

  /**
   * Check if a given parent URI has child nodes.
   * @param parentUri The parent URI to check.
   * @returns True if the parent URI has child nodes, false otherwise.
   */
  hasChildNodes(parentUri: vscode.Uri): boolean {
    return this._childNodeMap.has(parentUri);
  }

  /**
   * Get the mark status for a given URI. If the URI is not in the node map,
   * it is considered unmarked.
   * @param uri The URI to get the mark status for.
   * @returns The mark status of the URI.
   */
  getMarkStatus(uri: vscode.Uri): MarkStatus {
    const node = this._nodeMap.get(uri);
    if (node == null) {
      return 'unmarked';
    }

    return node.status;
  }

  /**
   * Iterate the node tree starting at the given root URI in breadth-first order.
   * @param rootUri The root URI to start the iteration from.
   * @returns An iterable of MarkableWsTreeNode objects.
   */
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
    const markStatus = this.getMarkStatus(uri);
    if (markStatus === 'unmarked') {
      return;
    }

    return new vscode.FileDecoration(
      '\u{25AA}',
      'Deephaven source',
      new vscode.ThemeColor(
        markStatus === 'marked' ? 'charts.green' : 'charts.orange'
      )
    );
  }

  /**
   * Refresh caches based on current workspace state.
   */
  async refresh(): Promise<void> {
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

      this._updateNodeMaps(null, {
        uri: wsUri,
        name: ws.name,
        status: 'unmarked',
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

          this._updateNodeMaps(parentUri, {
            uri,
            isFile: uri.fsPath === fileUri.fsPath,
            status: 'unmarked',
            name: token,
          });

          parentUri = uri;
        }
      }
    }

    this._onDidChangeFileDecorations.fire(undefined);
    this._onDidUpdate.fire();
  }

  /**
   * Update the mark status of all ancestor nodes based on their children's
   * statuses.
   * @param uri The starting URI to update from.
   */
  private _updateAncestorMarkStatus(uri: vscode.Uri): void {
    const parentUri = this._parentUriMap.get(uri);

    if (parentUri == null) {
      return;
    }

    const parentNode = this._nodeMap.getOrThrow(parentUri);
    const childMap = this._childNodeMap.getOrThrow(parentUri);

    const counts = {
      marked: 0,
      unmarked: 0,
      mixed: 0,
    };

    for (const n of childMap.values()) {
      counts[n.status]++;
    }

    parentNode.status =
      counts.marked === childMap.size
        ? 'marked'
        : counts.unmarked === childMap.size
          ? 'unmarked'
          : 'mixed';

    this._updateAncestorMarkStatus(parentUri);
  }

  /**
   * Update maps for a given node and its parent.
   * @param parentUri parent URI, or null if root
   * @param node the node to update maps for
   */
  private _updateNodeMaps(
    parentUri: vscode.Uri | null,
    node: MarkableWsTreeNode
  ): void {
    this._parentUriMap.set(node.uri, parentUri);
    this._nodeMap.set(node.uri, node);

    if (parentUri == null) {
      this._rootNodeMap.set(node.uri, node);
    } else {
      if (!this._childNodeMap.has(parentUri)) {
        this._childNodeMap.set(parentUri, new URIMap());
      }
      const childMap = this._childNodeMap.get(parentUri)!;
      childMap.set(node.uri, node);
    }
  }
}
