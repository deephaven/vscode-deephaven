import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { DisposableBase } from './DisposableBase';
import { Logger } from '../shared';
import {
  getSetExecutionContextScript,
  getTopLevelModuleFullname,
  registerRemoteFileSourcePluginMessageListener,
} from '../util';
import type { ModuleFullname, UniqueID } from '../types';
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
  }

  private _onDidUpdateModuleMeta = new vscode.EventEmitter<void>();
  readonly onDidUpdateModuleMeta = this._onDidUpdateModuleMeta.event;

  /**
   * Get the top level Python module names available to the remote file source.
   */
  getTopLevelPythonModuleNames(): Set<ModuleFullname> {
    const set = new Set<ModuleFullname>();

    this._pythonWorkspace.getTopLevelMarkedFolders().forEach(({ uri }) => {
      set.add(getTopLevelModuleFullname(uri));
    });

    return set;
  }

  /**
   * Get the URI for a given module fullname.
   * @param moduleFullname The Python module fullname to look for.
   * @returns The URI for the module fullname, or undefined if not found.
   */
  getUriForModuleFullname(
    moduleFullname: ModuleFullname
  ): vscode.Uri | undefined {
    const [firstModuleToken, ...restModuleTokens] = moduleFullname.split('.');

    for (const { uri } of this._pythonWorkspace.getTopLevelMarkedFolders()) {
      const topLevelModuleName = getTopLevelModuleFullname(uri);
      if (firstModuleToken !== topLevelModuleName) {
        continue;
      }

      for (const ext of ['.py', '/__init__.py']) {
        const fileUri =
          restModuleTokens.length === 0
            ? vscode.Uri.parse(`${uri.toString()}${ext}`)
            : vscode.Uri.joinPath(uri, `${restModuleTokens.join('/')}${ext}`);

        if (this._pythonWorkspace.isMarked(fileUri)) {
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
   * Register a session + plugin with the remote file source service.
   * @param session the ide session
   * @param plugin the remote file source plugin widget
   * @returns an unsubscribe function to unregister subscriptions
   */
  async registerPlugin(
    session: DhcType.IdeSession,
    plugin: DhcType.Widget
  ): Promise<() => void> {
    const getModuleFilePath = this.getUriForModuleFullname.bind(this);
    const messageSubscription = registerRemoteFileSourcePluginMessageListener(
      plugin,
      getModuleFilePath
    );

    const setServerExecutionContext = this.setServerExecutionContext.bind(
      this,
      null,
      session
    );

    // Set initial top-level module names and subscribe to update on meta changes
    await setServerExecutionContext();
    const metaSubscription = this.onDidUpdateModuleMeta(
      setServerExecutionContext
    );

    this.disposables.add(messageSubscription);
    this.disposables.add(metaSubscription);

    return () => {
      messageSubscription();
      metaSubscription.dispose();
    };
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
