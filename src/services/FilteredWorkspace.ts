import * as vscode from 'vscode';
import type {
  FilePattern,
  FolderName,
  ModuleFullname,
  RemoteImportSourceTreeFileElement,
  RemoteImportSourceTreeFolderElement,
  RemoteImportSourceTreeTopLevelMarkedFolderElement,
  RemoteImportSourceTreeWkspRootFolderElement,
} from '../types';
import {
  getTopLevelModuleFullname,
  getWorkspaceFileUriMap,
  URIMap,
  URISet,
  type Toaster,
} from '../util';
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

type FilteredWorkspaceRootNode = RemoteImportSourceTreeWkspRootFolderElement;
type FilteredWorkspaceTopLevelMarkedNode =
  RemoteImportSourceTreeTopLevelMarkedFolderElement;
type FilteredWorkspaceNode =
  | RemoteImportSourceTreeFileElement
  | RemoteImportSourceTreeFolderElement;

/**
 * Represents a filtered view of a VS Code workspace. Also supports "marking"
 * folders that can be used for an additional filter layer.
 */
export class FilteredWorkspace
  extends DisposableBase
  implements vscode.FileDecorationProvider
{
  constructor(
    readonly filePattern: FilePattern,
    private readonly _toaster: Toaster
  ) {
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

  private readonly _childNodeMap = new URIMap<URIMap<FilteredWorkspaceNode>>();
  private readonly _hasMarkedDescendantsSet = new URISet();
  private readonly _parentUriMap = new URIMap<vscode.Uri | null>();
  private readonly _nodeMap = new URIMap<FilteredWorkspaceNode>();
  private readonly _rootNodeMap = new URIMap<FilteredWorkspaceRootNode>();
  private readonly _topLevelMarkedUriMap = new Map<
    ModuleFullname,
    vscode.Uri
  >();
  private _wsFileUriMap = new URIMap<URISet>();

  /**
   * Check if a given URI has marked descendants.
   * @param uri The URI to check.
   * @returns True if the URI has marked descendants, false otherwise.
   */
  hasMarkedDescendants(uri: vscode.Uri): boolean {
    return this._hasMarkedDescendantsSet.has(uri);
  }

  /**
   * Mark a folder and all its children. Will also update parent folders if the
   * changes cause a status change.
   * @param folderUri The folder URI to mark.
   */
  markFolder(folderUri: vscode.Uri): void {
    this.unmarkConflictingTopLevelFolder(folderUri);

    for (const node of this.iterateNodeTree(folderUri)) {
      node.isMarked = true;

      const moduleName = getTopLevelModuleFullname(node.uri);

      if (node.uri.fsPath === folderUri.fsPath) {
        this._topLevelMarkedUriMap.set(moduleName, folderUri);
      } else {
        // Since we've marked the parent folder as top-level, remove top-level
        // status from any children
        this._topLevelMarkedUriMap.delete(moduleName);
      }

      const parentUri = this._parentUriMap.get(node.uri);

      // If the node is marked, all ancestors are flagged as having marked
      // descendants
      if (node.isMarked) {
        let currentUri: vscode.Uri | null | undefined = parentUri;
        while (currentUri != null) {
          this._hasMarkedDescendantsSet.add(currentUri);
          currentUri = this._parentUriMap.get(currentUri);
        }
      }
    }

    this._onDidChangeFileDecorations.fire(undefined);
    this._onDidUpdate.fire();
  }

  /**
   * A top-level module name can only be sourced from 1 folder. This method
   * checks for any existing mappings for the same module name as the given
   * folder URI, and unmarks them.
   * @param folderUri
   * @returns
   */
  unmarkConflictingTopLevelFolder(folderUri: vscode.Uri): void {
    const moduleName = getTopLevelModuleFullname(folderUri);
    const existingTopLevelUri = this._topLevelMarkedUriMap.get(moduleName);

    // If no existing mapping or mapping is the same as the requested one, no
    // need to unmark
    if (
      existingTopLevelUri == null ||
      existingTopLevelUri.fsPath === folderUri.fsPath
    ) {
      return;
    }

    // A module name can only be sourced from 1 folder. If we find an existing
    // mapping, unmark it first.
    const relativePath = vscode.workspace.asRelativePath(
      existingTopLevelUri,
      true
    );

    this.unmarkFolder(existingTopLevelUri);

    this._toaster.info(
      `Updated '${moduleName}' import source to '${relativePath}'.`
    );
  }

  /**
   * Unmark a folder, its children, and its ancestors.
   * @param folderUri The folder URI to unmark.
   */
  unmarkFolder(folderUri: vscode.Uri): void {
    for (const node of this.iterateNodeTree(folderUri)) {
      node.isMarked = false;
      const moduleName = getTopLevelModuleFullname(node.uri);
      this._topLevelMarkedUriMap.delete(moduleName);
    }

    for (const node of this.iterateAncestors(folderUri)) {
      node.isMarked = false;
      const moduleName = getTopLevelModuleFullname(node.uri);
      this._topLevelMarkedUriMap.delete(moduleName);

      // Since we've unmarked the parent as a top-level folder, we look for any
      // remaining marked children to re-add as top-level folders
      for (const childNode of this.getChildNodes(node.uri)) {
        if (childNode.isMarked) {
          this.unmarkConflictingTopLevelFolder(childNode.uri);

          this._topLevelMarkedUriMap.set(
            getTopLevelModuleFullname(childNode.uri),
            childNode.uri
          );
        }
      }
    }

    this._onDidChangeFileDecorations.fire(undefined);
    this._onDidUpdate.fire();
  }

  /**
   * Get the child nodes for a given parent URI, or the root nodes if parentUri is null.
   * @param parentUri The parent URI to get child nodes for, or null for root nodes.
   * @returns An array of child nodes.
   */
  getChildNodes(parentUri: null): FilteredWorkspaceRootNode[];
  getChildNodes(parentUri: vscode.Uri): FilteredWorkspaceNode[];
  getChildNodes(
    parentUri: vscode.Uri | null
  ): FilteredWorkspaceRootNode[] | FilteredWorkspaceNode[];
  getChildNodes(
    parentUri: vscode.Uri | null
  ): FilteredWorkspaceRootNode[] | FilteredWorkspaceNode[] {
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
   * Get top-level marked folder elements in the filtered workspace.
   * @returns The set of top-level marked folder elements.
   */
  getTopLevelMarkedFolders(): FilteredWorkspaceTopLevelMarkedNode[] {
    const topLeveMarkedlUris = [...this._topLevelMarkedUriMap.entries()];

    return topLeveMarkedlUris.map(([name, uri]) => ({
      name,
      type: 'topLevelMarkedFolder',
      isMarked: true,
      uri,
    }));
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
  isMarked(uri: vscode.Uri): boolean {
    const node = this._nodeMap.get(uri);
    if (node == null) {
      return false;
    }

    return node.isMarked;
  }

  /**
   * Iterate the ancestors of a given URI up to the root. Excludes the given
   * URI itself.
   * @param uri The URI to start the iteration from.
   */
  private *iterateAncestors(uri: vscode.Uri): Iterable<FilteredWorkspaceNode> {
    const queue: vscode.Uri[] = [uri];

    while (queue.length > 0) {
      const currentUri = queue.shift()!;
      const parentUri = this._parentUriMap.get(currentUri);
      if (parentUri == null || this._rootNodeMap.has(parentUri)) {
        break;
      }

      const parentNode = this._nodeMap.getOrThrow(parentUri);
      yield parentNode;

      queue.push(parentUri);
    }
  }

  /**
   * Iterate the node tree starting at the given root URI in breadth-first order.
   * @param rootUri The root URI to start the iteration from.
   * @returns An iterable of FilteredWorkspaceNode objects.
   */
  *iterateNodeTree(rootUri: vscode.Uri): Iterable<FilteredWorkspaceNode> {
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
    const isMarked = this.isMarked(uri);
    if (!isMarked) {
      return;
    }

    return new vscode.FileDecoration(
      '\u{25AA}',
      'Deephaven source',
      new vscode.ThemeColor(isMarked ? 'charts.green' : 'charts.orange')
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
    this._hasMarkedDescendantsSet.clear();
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
        name: ws.name,
        type: 'workspaceRootFolder',
        uri: wsUri,
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
            type: uri.fsPath === fileUri.fsPath ? 'file' : 'folder',
            isMarked: false,
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
   * Update maps for a given node and its parent.
   * @param parentUri parent URI, or null if root
   * @param node the node to update maps for
   */
  private _updateNodeMaps(
    parentUri: null,
    node: FilteredWorkspaceRootNode
  ): void;
  private _updateNodeMaps(
    parentUri: vscode.Uri,
    node: FilteredWorkspaceNode
  ): void;
  private _updateNodeMaps(
    parentUri: vscode.Uri | null,
    node: FilteredWorkspaceRootNode | FilteredWorkspaceNode
  ): void {
    this._parentUriMap.set(node.uri, parentUri);

    if (parentUri == null) {
      this._rootNodeMap.set(node.uri, node as FilteredWorkspaceRootNode);
    } else {
      this._nodeMap.set(node.uri, node as FilteredWorkspaceNode);
      if (!this._childNodeMap.has(parentUri)) {
        this._childNodeMap.set(parentUri, new URIMap());
      }
      const childMap = this._childNodeMap.get(parentUri)!;
      childMap.set(node.uri, node as FilteredWorkspaceNode);
    }
  }
}
