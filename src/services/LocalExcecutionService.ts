import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { DisposableBase } from './DisposableBase';
import { Logger } from '../shared';
import {
  createPythonModuleMeta,
  getSetExecutionContextScript,
  registerLocalExecPluginMessageListener,
  type PythonModuleMeta,
} from '../util';
import type { ModuleFullname, UniqueID } from '../types';

const logger = new Logger('LocalExcecutionService');

export class LocalExecutionService
  extends DisposableBase
  implements vscode.FileDecorationProvider
{
  constructor() {
    super();

    const watcher = vscode.workspace.createFileSystemWatcher('**/*.py');
    this.disposables.add(
      watcher.onDidCreate(() => this.updatePythonModuleMeta())
    );
    this.disposables.add(
      watcher.onDidDelete(() => this.updatePythonModuleMeta())
    );
    this.disposables.add(watcher);

    this.disposables.add(vscode.window.registerFileDecorationProvider(this));

    this.disposables.add(() => {
      this._unregisterLocalExecPlugin?.();
      this._unregisterLocalExecPlugin = null;
    });

    this.updatePythonModuleMeta();
  }

  // private _localExecPlugin: DhcType.Widget | null = null;
  private _unregisterLocalExecPlugin: (() => void) | null = null;
  private _moduleMeta: PythonModuleMeta | null = null;

  // TODO: Make this configurable
  private _ignoreTopLevelModuleNames = new Set<string>([
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
    // TESTING
    'broken',
    'pandas',
  ]);

  private _onDidChangeFileDecorations = new vscode.EventEmitter<
    vscode.Uri | vscode.Uri[] | undefined
  >();
  readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

  /**
   * Get the top level Python module names sourced by local execution excluding
   * any listed in _ignoreTopLevelModuleNames.
   */
  getTopLevelPythonModuleNames(): Set<string> {
    const set = new Set<string>();

    if (this._moduleMeta == null) {
      return set;
    }

    for (const namesSet of this._moduleMeta.topLevelModuleNames.values()) {
      for (const name of namesSet) {
        if (!this._ignoreTopLevelModuleNames.has(name)) {
          set.add(name);
        }
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
    if (this._moduleMeta == null || vscode.workspace.workspaceFolders == null) {
      return;
    }

    let uri: vscode.Uri | undefined;

    // Check in the workspace folder order defined in the current workspace
    for (const wsFolder of vscode.workspace.workspaceFolders) {
      const map = this._moduleMeta.moduleMap.get(wsFolder.uri);
      if (map == null) {
        continue;
      }

      uri =
        map.get(moduleFullname) ??
        map.get(`${moduleFullname}.__init__` as ModuleFullname);

      if (uri != null) {
        break;
      }
    }

    return uri;
  }

  /**
   * Get top-level ModuleName set for given workspace folder Uri.
   * @param wsUri The workspace folder Uri.
   * @returns The set of top level module names, or null if not found.
   */
  getTopLevelModuleNamesSetForWorkspace(
    wsUri: vscode.Uri | null | undefined
  ): Set<ModuleFullname> | null {
    if (wsUri == null || this._moduleMeta == null) {
      return null;
    }

    return this._moduleMeta.topLevelModuleNames.get(wsUri) ?? null;
  }

  /**
   * Determine if given Uri should be decorated as a Deephaven source.
   * @param uri The Uri to check.
   * @returns True if the Uri should be decorated.
   */
  isDecoratedUri(uri: vscode.Uri, topLevelOnly: boolean): boolean {
    const moduleNamesSet = this.getTopLevelModuleNamesSetForWorkspace(
      vscode.workspace.getWorkspaceFolder(uri)?.uri
    );

    if (moduleNamesSet == null) {
      return false;
    }

    const relativePath = vscode.workspace.asRelativePath(uri, false);
    const tokens = relativePath.split('/');

    if (topLevelOnly && tokens.length > 1) {
      return false;
    }

    const topLevelModuleName = tokens[0] as ModuleFullname;

    return moduleNamesSet.has(topLevelModuleName);
  }

  /** Register a local execution plugin. */
  async registerLocalExecPlugin(
    localExecPlugin: DhcType.Widget
  ): Promise<void> {
    this._unregisterLocalExecPlugin?.();

    this._unregisterLocalExecPlugin = registerLocalExecPluginMessageListener(
      localExecPlugin,
      this.getUriForModuleFullname.bind(this)
    );
  }

  /** Rebuild Python module maps */
  async updatePythonModuleMeta(): Promise<void> {
    this._moduleMeta = await createPythonModuleMeta(
      this._ignoreTopLevelModuleNames
    );
    logger.log('Updated python module meta:', this._moduleMeta);

    this._onDidChangeFileDecorations.fire(undefined);
  }

  async setServerExecutionContext(
    connectionId: UniqueID,
    session: DhcType.IdeSession
  ): Promise<void> {
    const setExecutionContextScript = getSetExecutionContextScript(
      connectionId,
      this.getTopLevelPythonModuleNames()
    );

    await session.runCode(setExecutionContextScript);
  }

  provideFileDecoration(
    uri: vscode.Uri,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.FileDecoration> {
    // TODO: As-is, child folders any top-level modules identified for decoration
    // will also include their children. If this proves to be too much clutter,
    // we could set this to `true` to only decorate top-level folders. Also could
    // make this a user setting.
    const topLevelOnly = false;

    if (!this.isDecoratedUri(uri, topLevelOnly)) {
      return;
    }

    return new vscode.FileDecoration(
      '\u{25AA}',
      'Deephaven source',
      new vscode.ThemeColor('charts.green')
    );
  }
}
