import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { DisposableBase } from './DisposableBase';
import {
  getSetExecutionContextScript,
  getTopLevelModuleFullname,
  Logger,
  registerRemoteFileSourcePluginMessageListener,
} from '../util';
import type {
  GroovyResourceName,
  PythonModuleFullname,
  PythonModuleSpecData,
  UniqueID,
} from '../types';
import type { FilteredWorkspace } from './FilteredWorkspace';

const logger = new Logger('RemoteFileSourceService');

export class RemoteFileSourceService extends DisposableBase {
  constructor(
    private readonly _groovyWorkspace: FilteredWorkspace,
    private readonly _pythonWorkspace: FilteredWorkspace
  ) {
    super();

    this.disposables.add(
      this._groovyWorkspace.onDidUpdate(() => {
        this._onDidUpdateGroovyModuleMeta.fire();
      })
    );

    this.disposables.add(
      this._pythonWorkspace.onDidUpdate(() => {
        this._onDidUpdatePythonModuleMeta.fire();
      })
    );
  }

  private _onDidUpdateGroovyModuleMeta = new vscode.EventEmitter<void>();
  readonly onDidUpdateGroovyModuleMeta =
    this._onDidUpdateGroovyModuleMeta.event;

  private _onDidUpdatePythonModuleMeta = new vscode.EventEmitter<void>();
  readonly onDidUpdatePythonModuleMeta =
    this._onDidUpdatePythonModuleMeta.event;

  /**
   * Get Groovy resource content for a given resource name.
   * @param resourceName The Groovy resource name.
   * @returns The Groovy resource content.
   */
  getGroovyResource(resourceName: GroovyResourceName): string {
    console.log(resourceName);
    return '';
  }

  /**
   * Get the top level Python module names available to the remote file source.
   */
  getTopLevelPythonModuleNames(): Set<PythonModuleFullname> {
    const set = new Set<PythonModuleFullname>();

    this._pythonWorkspace.getTopLevelMarkedFolders().forEach(({ uri }) => {
      set.add(getTopLevelModuleFullname(uri));
    });

    return set;
  }

  /**
   * Get Python module spec data for a given module fullname.
   * @param moduleFullname The Python module fullname to look for.
   * @returns The Python module spec data, or undefined if not found.
   */
  getPythonModuleSpecData(
    moduleFullname: PythonModuleFullname
  ): PythonModuleSpecData | null {
    const [firstModuleToken, ...restModuleTokens] = moduleFullname.split('.');

    // Get the top-level folder URI that could contain this module
    const topLevelFolderUri = this._pythonWorkspace
      .getTopLevelMarkedFolders()
      .find(
        ({ uri }) => getTopLevelModuleFullname(uri) === firstModuleToken
      )?.uri;

    if (topLevelFolderUri == null) {
      return null;
    }

    // Get the full URI for the module without extension under the top-level folder
    const moduleUriNoExt = vscode.Uri.joinPath(
      topLevelFolderUri,
      `${restModuleTokens.join('/')}`
    );

    // If this is a folder, it is a package
    if (this._pythonWorkspace.hasFolder(moduleUriNoExt)) {
      const initUri = vscode.Uri.joinPath(moduleUriNoExt, '__init__.py');

      // Regular packages have an __init__.py file. Namespace packages do not.
      const packageType = this._pythonWorkspace.hasFile(initUri)
        ? 'regular'
        : 'namespace';

      logger.info(
        `${packageType} package found:`,
        moduleFullname,
        moduleUriNoExt.fsPath
      );

      // Regular packages have an origin, namespace packages do not.
      const origin = packageType === 'regular' ? initUri.fsPath : undefined;

      return {
        name: moduleFullname,
        isPackage: true,
        origin,
        // Note that the extension currently only supports single submodule
        // search locations. We could eventually support namespaces packages
        // with multiple by including top-level marked folders with the same
        // name.
        subModuleSearchLocations: [moduleUriNoExt.fsPath],
      };
    }

    const pyFileUri = vscode.Uri.parse(`${moduleUriNoExt.toString()}.py`);

    if (this._pythonWorkspace.hasFile(pyFileUri)) {
      logger.info('regular module found:', moduleFullname, pyFileUri.fsPath);

      return {
        name: moduleFullname,
        isPackage: false,
        origin: pyFileUri.fsPath,
      };
    }

    return null;
  }

  async registerGroovyPlugin(
    _session: DhcType.IdeSession,
    plugin: DhcType.remotefilesource.RemoteFileSourceService
  ): Promise<() => void> {
    return plugin.addEventListener('requestSource', async event => {
      console.log('[TESTING] requestSource event:', event);
    });
  }

  /**
   * Register a session + plugin with the remote file source service.
   * @param session the ide session
   * @param plugin the remote file source plugin widget
   * @returns an unsubscribe function to unregister subscriptions
   */
  async registerPythonPlugin(
    session: DhcType.IdeSession,
    plugin: DhcType.Widget
  ): Promise<() => void> {
    const getPythonModuleSpecData = this.getPythonModuleSpecData.bind(this);
    const messageSubscription = registerRemoteFileSourcePluginMessageListener(
      plugin,
      getPythonModuleSpecData
    );

    const setServerExecutionContext = this.setPythonServerExecutionContext.bind(
      this,
      null,
      session
    );

    // Set initial top-level module names and subscribe to update on meta changes
    await setServerExecutionContext();
    const metaSubscription = this.onDidUpdatePythonModuleMeta(
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
   * Set the Python server execution context for the plugin using the given session.
   * @param connectionId The unique ID of the connection.
   * @param session The IdeSession to use to run the code.
   */
  async setPythonServerExecutionContext(
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
