import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { URIMap } from './maps';
import { Logger } from '../shared';
import type {
  Include,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcSetConnectionIdRequest,
  JsonRpcSuccess,
  ModuleFullname,
  UniqueID,
} from '../types';
import { withResolvers } from './promiseUtils';

const logger = new Logger('dhLocalExecutionUtils');

export type PythonModuleWorkspaceMap = URIMap<
  Map<ModuleFullname, Include<vscode.Uri>>
>;

export interface PythonModuleMeta {
  moduleMap: PythonModuleWorkspaceMap;
  topLevelModuleNames: URIMap<Map<ModuleFullname, Include<ModuleFullname>>>;
}

export const DH_LOCAL_EXECUTION_PLUGIN_VARIABLE = '__deephaven_vscode' as const;
export const DH_LOCAL_EXECUTION_PLUGIN_CLASS =
  'DeephavenLocalExecPlugin' as const;

export const DH_LOCAL_EXECUTION_PLUGIN_INIT_SCRIPT = [
  'try:',
  `    ${DH_LOCAL_EXECUTION_PLUGIN_VARIABLE}`,
  'except NameError:',
  '    from deephaven_local_exec_plugin import DeephavenLocalExecPluginObject',
  `    ${DH_LOCAL_EXECUTION_PLUGIN_VARIABLE} = DeephavenLocalExecPluginObject()`,
].join('\n');

// Alias for `dh.Widget.EVENT_MESSAGE` to avoid having to pass in a `dh` instance
// to util functions that only need the event name.
export const DH_WIDGET_EVENT_MESSAGE = 'message' as const;

/**
 * Create metadata about python modules in the workspace, marking top-level
 * modules to include.
 * Note that this data will determine which URIs the server can access, so it's
 * important it doesn't include modules outside of what user has opted in to
 * share.
 * @param includeTopLevelModules
 * @param ignoreTopLevelModuleFolderNames
 * @returns metadata about python modules in the workspace
 */
export async function createPythonModuleMeta(
  includeTopLevelModules: Set<ModuleFullname>,
  ignoreTopLevelModuleFolderNames: Set<string>
): Promise<PythonModuleMeta> {
  const meta: PythonModuleMeta = {
    moduleMap: new URIMap(),
    topLevelModuleNames: new URIMap(),
  };

  const uris = await vscode.workspace.findFiles(
    '**/*.py',
    `{${[...ignoreTopLevelModuleFolderNames].join(',')}}/**`
  );

  // Group module names by workspace folder

  for (const uri of uris) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (workspaceFolder == null) {
      logger.log('No workspace folder for uri:', uri);
      continue;
    }

    // Ensure collections exist for this workspace folder
    if (!meta.moduleMap.has(workspaceFolder.uri)) {
      meta.moduleMap.set(workspaceFolder.uri, new Map());
    }
    if (!meta.topLevelModuleNames.has(workspaceFolder.uri)) {
      meta.topLevelModuleNames.set(workspaceFolder.uri, new Map());
    }

    const relativePath = vscode.workspace.asRelativePath(uri, false);
    const moduleFullName = relativePath
      .replaceAll('/', '.')
      .replace(/\.py$/, '') as ModuleFullname;
    const tokens = moduleFullName.split('.');
    const topLevelModuleName = (
      tokens[0] === '' ? `.${tokens[1]}` : tokens[0]
    ) as ModuleFullname;

    const include = includeTopLevelModules.has(topLevelModuleName);

    // Add to top level module names set
    const topLevelModuleNamesSet = meta.topLevelModuleNames.getOrThrow(
      workspaceFolder.uri
    );
    topLevelModuleNamesSet.set(topLevelModuleName, {
      value: topLevelModuleName,
      include,
    });

    // Add to modulename -> uri map
    const workspaceFolderMap = meta.moduleMap.getOrThrow(workspaceFolder.uri);
    workspaceFolderMap.set(moduleFullName, { value: uri, include });
  }

  return meta;
}

/**
 * If local execution plugin is installed, get an instance of it and set the
 * connection ID.
 * @param cnId connection ID to set on the message stream / connection
 * @param session session to get the plugin from
 * @param workerUrl URL of the Core / Core+ worker
 * @returns a Promise that resolves to the local execution plugin widget, or
 * null if plugin is not installed
 */
export async function getLocalExecutionPlugin(
  cnId: UniqueID,
  session: DhcType.IdeSession,
  workerUrl: URL
): Promise<DhcType.Widget | null> {
  if (!(await isLocalExecutionPluginInstalled(workerUrl))) {
    return null;
  }

  // Initialize the local execution plugin if it is not already initialized.
  await session.runCode(DH_LOCAL_EXECUTION_PLUGIN_INIT_SCRIPT);

  const localExecPlugin: DhcType.Widget = await session.getObject({
    name: DH_LOCAL_EXECUTION_PLUGIN_VARIABLE,
    type: DH_LOCAL_EXECUTION_PLUGIN_CLASS,
  });

  const msg: JsonRpcSetConnectionIdRequest = {
    jsonrpc: '2.0',
    id: cnId,
    method: 'set_connection_id',
  };

  await sendWidgetMessageAsync(localExecPlugin, msg);

  return localExecPlugin;
}

/**
 * Get a script to set the execution context on the local execution plugin.
 * @param connectionId The unique ID of the connection.
 * @param moduleFullnames An iterable of module fullnames of python files.
 * @returns A Python script string.
 */
export function getSetExecutionContextScript(
  connectionId: UniqueID | null,
  moduleFullnames: Iterable<string>
): string {
  const connectionIdStr = connectionId == null ? 'None' : `'${connectionId}'`;
  const moduleFullnamesStr = `{${[...moduleFullnames].map(modulePath => `"${modulePath}"`).join(',')}}`;
  return `${DH_LOCAL_EXECUTION_PLUGIN_VARIABLE}.set_execution_context(${connectionIdStr}, ${moduleFullnamesStr})`;
}

/**
 * Check if the local execution plugin is installed on the given worker.
 * @param workerUrl URL of the Core / Core+ worker
 * @returns
 */
export async function isLocalExecutionPluginInstalled(
  workerUrl: URL
): Promise<boolean> {
  const pluginsManifestUrl = new URL('/js-plugins/manifest.json', workerUrl);

  try {
    const response = await fetch(pluginsManifestUrl, { method: 'GET' });
    const manifestJson: { plugins: { name: string }[] } = await response.json();

    return manifestJson.plugins.some(
      plugin => plugin.name === 'deephaven-local-exec-plugin'
    );
  } catch (err) {
    logger.error('Error checking for local execution plugin', err);
    return false;
  }
}

/**
 * Register a message listener on the local execution plugin to handle requests.
 * @param localExecPlugin the local execution plugin widget
 * @param getModuleFilePath a function that returns the file path for a given module fullname
 * @returns a function to unregister the listener
 */
export function registerLocalExecPluginMessageListener(
  localExecPlugin: DhcType.Widget,
  getModuleFilePath: (moduleFullname: ModuleFullname) => vscode.Uri | undefined
): () => void {
  return localExecPlugin.addEventListener<DhcType.Widget>(
    DH_WIDGET_EVENT_MESSAGE,
    async ({ detail }) => {
      try {
        const message: JsonRpcRequest = JSON.parse(detail.getDataAsString());
        if (message.method !== 'fetch_module') {
          return;
        }

        logger.log('Received message from server:', message);

        const filepath = getModuleFilePath(message.params.module_name);

        let source: string | undefined;
        if (filepath != null) {
          const textDoc = await vscode.workspace.openTextDocument(filepath);
          source = textDoc.getText();
        }

        const response: JsonRpcSuccess = {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            filepath: filepath?.fsPath ?? '<string>',
            source: filepath == null ? undefined : source,
          },
        };

        logger.log('Sending response to server:', response);
        localExecPlugin.sendMessage(JSON.stringify(response));
      } catch (err) {
        logger.error('Error parsing message from server:', err);
      }
    }
  );
}

/**
 * Send a message to a widget plugin and return a Promise that will be resolved
 * when a response is received matching the id.
 * @param widget the widget to send the message to
 * @param request the request to send
 * @returns Promise that resolves to the response
 */
export function sendWidgetMessageAsync<
  TRequest extends JsonRpcRequest,
  TResponse extends JsonRpcResponse,
>(widget: DhcType.Widget, request: TRequest): Promise<TResponse> {
  const { promise, resolve } = withResolvers<TResponse>();

  const removeEventListener = widget.addEventListener<DhcType.Widget>(
    DH_WIDGET_EVENT_MESSAGE,
    async ({ detail }) => {
      try {
        const message: JsonRpcResponse | JsonRpcRequest = JSON.parse(
          detail.getDataAsString()
        );

        if ('id' in message && message.id === request.id) {
          resolve(message as TResponse);
          removeEventListener();
        }
      } catch (err) {
        logger.error('Error parsing message from server:', err);
      }
    }
  );

  widget.sendMessage(JSON.stringify(request));

  return promise;
}
