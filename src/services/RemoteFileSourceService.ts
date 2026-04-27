import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { DisposableBase } from './DisposableBase';
import {
  getSetExecutionContextScript,
  getPythonTopLevelModuleFullname,
  Logger,
  registerGroovyRemoteFileSourcePluginMessageListener,
  registerPythonRemoteFileSourcePluginMessageListener,
  getGroovyTopLevelPackageName,
  getClearControllerPrefixesScript,
} from '../util';
import type {
  GroovyPackageName,
  GroovyResourceData,
  GroovyResourceName,
  PythonModuleFullname,
  PythonModuleSpecData,
  UniqueID,
} from '../types';
import type { FilteredWorkspace } from './FilteredWorkspace';

const logger = new Logger('RemoteFileSourceService');

export class RemoteFileSourceService extends DisposableBase {
  constructor(
    private readonly _groovyWorkspace: FilteredWorkspace<GroovyPackageName>,
    private readonly _pythonWorkspace: FilteredWorkspace<PythonModuleFullname>
  ) {
    super();

    this.disposables.add(
      this._groovyWorkspace.onDidUpdate(() => {
        this._isGroovyWorkspaceDirty = true;
      })
    );

    this.disposables.add(
      this._pythonWorkspace.onDidUpdate(() => {
        this._onDidUpdatePythonModuleMeta.fire();
      })
    );
  }

  private _isGroovyWorkspaceDirty = false;
  private _controllerImportPrefixes = new Set<string>();

  private _onDidUpdatePythonModuleMeta = new vscode.EventEmitter<void>();
  readonly onDidUpdatePythonModuleMeta =
    this._onDidUpdatePythonModuleMeta.event;

  /**
   * Get Groovy source for a given resource name.
   * @param resourceName The Groovy resource name.
   * @returns The Groovy source content.
   */
  getGroovyResourceData(
    resourceName: GroovyResourceName
  ): GroovyResourceData | null {
    const [firstModuleToken, ...restModuleTokens] = resourceName.split('/');

    // Get the top-level folder URI that could contain this module
    const topLevelFolderUri = this._groovyWorkspace
      .getTopLevelMarkedFolders()
      .find(
        ({ uri }) => getGroovyTopLevelPackageName(uri) === firstModuleToken
      )?.uri;

    if (topLevelFolderUri == null) {
      return null;
    }

    // Get the full URI for the resource under the top-level folder
    const originUri = vscode.Uri.joinPath(
      topLevelFolderUri,
      `${restModuleTokens.join('/')}`
    );

    if (!this._groovyWorkspace.hasFile(originUri)) {
      return null;
    }

    return {
      name: resourceName,
      origin: originUri.fsPath,
    };
  }

  /**
   * Get Python module spec data for a given module fullname.
   * @param moduleFullname The Python module fullname to look for.
   * @returns The Python module spec data, or undefined if not found.
   */
  getPythonModuleSpecData(
    moduleFullname: PythonModuleFullname
  ): PythonModuleSpecData | null {
    let [firstModuleToken, ...restModuleTokens] = moduleFullname.split('.');

    // Check if first token is a controller import prefix and strip it
    if (
      this._controllerImportPrefixes.has(firstModuleToken) &&
      restModuleTokens.length > 0
    ) {
      firstModuleToken = restModuleTokens[0];
      restModuleTokens = restModuleTokens.slice(1);
    }

    // Get the top-level folder URI that could contain this module
    const topLevelFolderUri = this._pythonWorkspace
      .getTopLevelMarkedFolders()
      .find(
        ({ uri }) => getPythonTopLevelModuleFullname(uri) === firstModuleToken
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

  /**
   * Get the top level Python module names available to the remote file source.
   */
  getPythonTopLevelModuleNames(): Set<PythonModuleFullname> {
    const set = new Set<PythonModuleFullname>();

    this._pythonWorkspace.getTopLevelMarkedFolders().forEach(({ uri }) => {
      const moduleName = getPythonTopLevelModuleFullname(uri);

      set.add(moduleName);

      for (const prefix of this._controllerImportPrefixes) {
        set.add(`${prefix}.${moduleName}` as PythonModuleFullname);
      }
    });

    return set;
  }

  async registerGroovyPlugin(
    _session: DhcType.IdeSession,
    pluginService: DhcType.remotefilesource.RemoteFileSourceService
  ): Promise<() => void> {
    const getGroovyResourceData = this.getGroovyResourceData.bind(this);

    const messageSubscription =
      registerGroovyRemoteFileSourcePluginMessageListener(
        pluginService,
        getGroovyResourceData
      );

    this.disposables.add(messageSubscription);

    return () => {
      messageSubscription();
    };
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
    const messageSubscription =
      registerPythonRemoteFileSourcePluginMessageListener(
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
   * Update controller import prefixes based on Python code being executed.
   * @param controllerImportPrefixes The set of controller import prefixes to
   * use for resolving imports in the code being executed.
   */
  setControllerImportPrefixes(controllerImportPrefixes: Set<string>): void {
    this._controllerImportPrefixes = controllerImportPrefixes;
  }

  /**
   * Set the Groovy server execution context for the plugin.
   * @param pluginService The remote file source plugin service.
   */
  async setGroovyServerExecutionContext(
    pluginService: DhcType.remotefilesource.RemoteFileSourceService
  ): Promise<void> {
    const isDirty = this._isGroovyWorkspaceDirty;
    this._isGroovyWorkspaceDirty = false;

    const resourcePaths = [
      ...this._groovyWorkspace.getMarkedRelativeFilePaths(),
    ];

    logger.debug(
      'Setting Groovy server execution context. isDirty:',
      isDirty,
      'resourcePaths:',
      resourcePaths
    );

    await pluginService.setExecutionContext(isDirty, resourcePaths);
  }

  private _pythonSetExecutionContextI = 0;
  private _pythonExecutionContextQueue: Promise<void> = Promise.resolve();

  /**
   * Set the Python server execution context for the plugin using the given session.
   * We use a Promise queue to ensure that execution context updates are processed
   * sequentially. This is mostly to prevent Python workspace events that call
   * this method without awaiting the response from clearing the execution context.
   * @param connectionId The unique ID of the connection.
   * @param session The IdeSession to use to run the code.
   */
  async setPythonServerExecutionContext(
    connectionId: UniqueID | null,
    session: DhcType.IdeSession
  ): Promise<void> {
    const label = `setPythonServerExecutionContext: ${++this._pythonSetExecutionContextI}:${connectionId}`;

    logger.debug(`${label}: queuing`);

    this._pythonExecutionContextQueue = this._pythonExecutionContextQueue
      // Ignore errors from previous calls. They will get raised to the caller
      // that queued them, but we dont' want them to break the chain
      .catch(() => {})
      .then(async () => {
        logger.debug(`${label}: running`);

        const clearControllerPrefixesScript = getClearControllerPrefixesScript(
          this._controllerImportPrefixes
        );

        const setExecutionContextScript = getSetExecutionContextScript(
          connectionId,
          this.getPythonTopLevelModuleNames()
        );

        const scripts = [
          clearControllerPrefixesScript,
          setExecutionContextScript,
        ].filter(Boolean);

        await session.runCode(scripts.join('\n'));
      });

    await this._pythonExecutionContextQueue;

    logger.debug(`${label}: complete`);
  }
}
