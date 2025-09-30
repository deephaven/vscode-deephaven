import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { DisposableBase } from './DisposableBase';
import { Logger } from '../shared';
import {
  getSetExecutionContextScript,
  registerLocalExecPluginMessageListener,
} from '../util';
import type { ModuleFullname, RelativeWsUriString, UniqueID } from '../types';
import type { FilePatternWorkspace } from './FilePatternWorkspace';

const logger = new Logger('LocalExcecutionService');

export class LocalExecutionService
  extends DisposableBase
  implements vscode.FileDecorationProvider
{
  constructor(private readonly _pythonWorkspace: FilePatternWorkspace) {
    super();

    this.disposables.add(
      this._pythonWorkspace.onDidUpdate(() => {
        this._onDidUpdateModuleMeta.fire();
        this._onDidChangeFileDecorations.fire(undefined);
      })
    );
    this.disposables.add(vscode.window.registerFileDecorationProvider(this));

    this.disposables.add(() => {
      this._unregisterLocalExecPlugin?.();
      this._unregisterLocalExecPlugin = null;
    });
  }

  // private _localExecPlugin: DhcType.Widget | null = null;
  private _unregisterLocalExecPlugin: (() => void) | null = null;

  private _onDidChangeFileDecorations = new vscode.EventEmitter<
    vscode.Uri | vscode.Uri[] | undefined
  >();
  readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

  private _onDidUpdateModuleMeta = new vscode.EventEmitter<void>();
  readonly onDidUpdateModuleMeta = this._onDidUpdateModuleMeta.event;

  /**
   * Get the top level Python module names sourced by local execution excluding
   * any marked to ignore.
   */
  getTopLevelPythonModuleNames(): Set<ModuleFullname> {
    const set = new Set<ModuleFullname>();

    for (const includeSet of this._pythonWorkspace
      .getIncludeWsFolderPaths()
      .values()) {
      for (const folderPathStr of includeSet) {
        set.add(folderPathStr.replaceAll('/', '.') as ModuleFullname);
      }
    }

    return set;
  }

  /**
   * Get the URI for a given module fullname. Checks in workspace folder order
   * defined in the current workspace. If a module fullname is in multiple
   * workspace folders, the first one found is returned.
   * @param moduleFullname The Python module fullname to look for.
   * @returns The URI for the module fullname, or undefined if not found.
   */
  getUriForModuleFullname(
    moduleFullname: ModuleFullname
  ): vscode.Uri | undefined {
    if (vscode.workspace.workspaceFolders == null) {
      return;
    }

    // Check in the workspace folder order defined in the current workspace
    for (const wsFolder of vscode.workspace.workspaceFolders) {
      // TODO: Need a URISet
      const uriSet = this._pythonWorkspace.getWsFileUriMap().get(wsFolder.uri);

      if (uriSet == null) {
        continue;
      }

      const relativePath = moduleFullname.replaceAll(
        '.',
        '/'
      ) as RelativeWsUriString;

      for (const ext of ['.py', '/__init__.py']) {
        const fileUri = vscode.Uri.joinPath(
          wsFolder.uri,
          `${relativePath}${ext}`
        );

        if (
          uriSet.has(fileUri) &&
          this._pythonWorkspace.isIncluded(wsFolder.uri, fileUri)
        ) {
          logger.log(
            'Found moduleFullName fs path:',
            moduleFullname,
            fileUri.fsPath
          );
          return fileUri;
        }
      }
    }
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

    return this._pythonWorkspace.isIncluded(wsUri, uri);
  }

  /**
   * Register a local execution plugin.
   */
  async registerLocalExecPlugin(
    localExecPlugin: DhcType.Widget
  ): Promise<void> {
    this._unregisterLocalExecPlugin?.();

    this._unregisterLocalExecPlugin = registerLocalExecPluginMessageListener(
      localExecPlugin,
      this.getUriForModuleFullname.bind(this)
    );
  }

  /**
   * Set the server execution context for the plugin using the given session.
   * @param connectionId The unique ID of the connection.
   * @param session The IdeSession to use to run the code.
   */
  async setServerExecutionContext(
    connectionId: UniqueID | null,
    session: DhcType.IdeSession
  ): Promise<void> {
    const setExecutionContextScript = getSetExecutionContextScript(
      connectionId,
      this.getTopLevelPythonModuleNames()
    );

    await session.runCode(setExecutionContextScript);
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
}
