import * as vscode from 'vscode';
import type {
  FilePattern,
  FolderName,
  IncludableWsTreeNode,
  RelativeWsUriString,
} from '../types';
import {
  getWorkspaceFileUriMap,
  relativeWsUriString,
  URIMap,
  type URISet,
} from '../util';
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
 * Represents a workspace consisting of files matching a given pattern.
 */
export class FilePatternWorkspace
  extends DisposableBase
  implements vscode.FileDecorationProvider
{
  constructor(readonly filePattern: FilePattern) {
    super();

    this.disposables.add(vscode.window.registerFileDecorationProvider(this));

    const watcher = vscode.workspace.createFileSystemWatcher(filePattern);
    this.disposables.add(watcher.onDidCreate(() => this.update()));
    this.disposables.add(watcher.onDidDelete(() => this.update()));
    this.disposables.add(watcher);

    // TODO: Load include folders from storage

    this.update();
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
  private readonly _includeWsFolderPaths: URIMap<Set<RelativeWsUriString>> =
    new URIMap();

  private readonly _childNodeMap: URIMap<URIMap<IncludableWsTreeNode>> =
    new URIMap();
  private readonly _rootFolderNodeMap = new URIMap<IncludableWsTreeNode>();
  private _wsFileUriMap = new URIMap<URISet>();

  addIncludeFolder(folderUri: vscode.Uri): void {
    const wsUri = vscode.workspace.getWorkspaceFolder(folderUri)?.uri;
    if (wsUri == null) {
      return;
    }

    if (!this._includeWsFolderPaths.has(wsUri)) {
      this._includeWsFolderPaths.set(wsUri, new Set<RelativeWsUriString>());
    }

    const includeSet = this._includeWsFolderPaths.get(wsUri)!;
    includeSet.add(relativeWsUriString(folderUri));
  }

  // TODO: Make this smart enough to remove sub rules
  removeIncludeFolder(folderUri: vscode.Uri): void {
    const wsUri = vscode.workspace.getWorkspaceFolder(folderUri)?.uri;
    if (wsUri == null) {
      return;
    }

    const includeSet = this._includeWsFolderPaths.get(wsUri);
    if (includeSet == null) {
      return;
    }

    includeSet.delete(relativeWsUriString(folderUri));
  }

  getIncludeWsFolderPaths(): URIMap<Set<RelativeWsUriString>> {
    return this._includeWsFolderPaths;
  }

  getChildNodes(parentUri: vscode.Uri): IncludableWsTreeNode[] {
    const childMap = this._childNodeMap.get(parentUri);
    if (childMap == null) {
      return [];
    }

    return [...childMap.values()];
  }

  getRootFolderNodes(): IncludableWsTreeNode[] {
    return [...this._rootFolderNodeMap.values()];
  }

  getWsFileUriMap(): URIMap<URISet> {
    return this._wsFileUriMap;
  }

  hasChildNodes(parentUri: vscode.Uri): boolean {
    return this._childNodeMap.has(parentUri);
  }
  /**
   * Determine if given Uri should be decorated as a Deephaven source.
   * @param uri The Uri to check.
   * @returns True if the Uri should be decorated.
   */
  isDecoratedUri(uri: vscode.Uri): boolean {
    const wsUri = vscode.workspace.getWorkspaceFolder(uri)?.uri;
    if (wsUri == null) {
      return false;
    }

    return this.isIncluded(wsUri, uri);
  }

  isIncluded(wsUri: vscode.Uri, fileUri: vscode.Uri): boolean {
    const includeSet = this._includeWsFolderPaths.get(wsUri);
    if (includeSet == null) {
      return false;
    }

    const fileUriStr = relativeWsUriString(fileUri);
    for (const includeFolderStr of includeSet) {
      if (
        fileUriStr === includeFolderStr ||
        fileUriStr.startsWith(includeFolderStr)
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Provide decorations for a given uri if it is included in local execution.
   * @param uri The uri to provide decoration for.
   * @param _token
   * @returns A FileDecoration if the uri is decorated, otherwise undefined.
   */
  provideFileDecoration(
    uri: vscode.Uri,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.FileDecoration> {
    if (!this.isDecoratedUri(uri)) {
      return;
    }

    return new vscode.FileDecoration(
      '\u{25AA}',
      'Deephaven source',
      new vscode.ThemeColor('charts.green')
    );
  }

  async update(): Promise<void> {
    this._wsFileUriMap = await getWorkspaceFileUriMap(
      this.filePattern,
      this._ignoreTopLevelFolderNames
    );

    this._rootFolderNodeMap.clear();
    this._childNodeMap.clear();

    for (const [wsUri, fileUris] of this._wsFileUriMap.entries()) {
      if (fileUris.size === 0) {
        continue;
      }

      const ws = vscode.workspace.getWorkspaceFolder(wsUri);
      if (ws == null) {
        continue;
      }

      this._rootFolderNodeMap.set(wsUri, { uri: wsUri, name: ws.name });

      for (const fileUri of fileUris.keys()) {
        const include = this.isIncluded(wsUri, fileUri);

        const tokens = vscode.workspace
          .asRelativePath(fileUri, false)
          .split('/');

        if (tokens.length < 2) {
          // Ignore top-level files
          continue;
        }

        let parentUri = wsUri;
        for (const token of tokens) {
          const uri = vscode.Uri.joinPath(parentUri, token);

          if (!this._childNodeMap.has(parentUri)) {
            this._childNodeMap.set(parentUri, new URIMap());
          }

          const childMap = this._childNodeMap.get(parentUri)!;
          if (!childMap.has(uri)) {
            childMap.set(uri, {
              uri,
              isFile: uri.fsPath === fileUri.fsPath,
              include,
              name: token,
            });
          }

          parentUri = uri;
        }
      }
    }

    this._onDidChangeFileDecorations.fire(undefined);
    this._onDidUpdate.fire();
  }
}
