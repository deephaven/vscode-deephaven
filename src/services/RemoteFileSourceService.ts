import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { DisposableBase } from './DisposableBase';
import { Logger } from '../shared';
import {
  getSetExecutionContextScript,
  registerRemoteFileSourcePluginMessageListener,
  relativeWsUriString,
} from '../util';
import type { ModuleFullname, RelativeWsUriString, UniqueID } from '../types';
import type { FilteredWorkspace } from './FilteredWorkspace';

const logger = new Logger('RemoteFileSourceService');

export class RemoteFileSourceService extends DisposableBase {
  constructor(private readonly _pythonWorkspace: FilteredWorkspace) {
    super();

    this.disposables.add(
      this._pythonWorkspace.onDidUpdate(() => {
        this._onDidUpdateModuleMeta.fire();
      })
    );

    this.disposables.add(() => {
      this._unregisterPlugin?.();
      this._unregisterPlugin = null;
    });
  }

  private _unregisterPlugin: (() => void) | null = null;

  private _onDidUpdateModuleMeta = new vscode.EventEmitter<void>();
  readonly onDidUpdateModuleMeta = this._onDidUpdateModuleMeta.event;

  /**
   * Get the top level Python module names available to the remote file source.
   */
  getTopLevelPythonModuleNames(): Set<ModuleFullname> {
    const set = new Set<ModuleFullname>();

    this._pythonWorkspace.getTopLevelMarkedFolderUris().forEach(uri => {
      const folderPathStr = relativeWsUriString(uri);
      set.add(folderPathStr.replaceAll('/', '.') as ModuleFullname);
    });

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
          this._pythonWorkspace.getMarkStatus(fileUri) === 'marked'
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
   * Register a remote file source plugin.
   */
  async registerPlugin(plugin: DhcType.Widget): Promise<void> {
    this._unregisterPlugin?.();

    this._unregisterPlugin = registerRemoteFileSourcePluginMessageListener(
      plugin,
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
}
