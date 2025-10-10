import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { URIMap } from './maps';
import { Logger } from '../shared';
import type {
  FilePattern,
  FolderName,
  Include,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcSetConnectionIdRequest,
  JsonRpcSuccess,
  ModuleFullname,
  UniqueID,
} from '../types';
import { withResolvers } from './promiseUtils';
import { URISet } from './sets';
import {
  DH_PYTHON_REMOTE_SOURCE_PLUGIN_CLASS,
  DH_PYTHON_REMOTE_SOURCE_PLUGIN_VARIABLE,
  DH_PYTHON_REMOTE_SOURCE_PLUGIN_NAME,
} from '../common';

const logger = new Logger('remoteFileSourceUtils');

export type PythonModuleWorkspaceMap = URIMap<
  Map<ModuleFullname, Include<vscode.Uri>>
>;

export interface PythonModuleMeta {
  moduleMap: PythonModuleWorkspaceMap;
  topLevelModuleNames: URIMap<Map<ModuleFullname, Include<ModuleFullname>>>;
}

export const DH_PYTHON_REMOTE_SOURCE_PLUGIN_INIT_SCRIPT = [
  'try:',
  `    ${DH_PYTHON_REMOTE_SOURCE_PLUGIN_VARIABLE}`,
  'except NameError:',
  '    from deephaven.python_remote_file_source import PluginObject as DeephavenRemoteFileSourcePlugin',
  `    ${DH_PYTHON_REMOTE_SOURCE_PLUGIN_VARIABLE} = DeephavenRemoteFileSourcePlugin()`,
].join('\n');

// Alias for `dh.Widget.EVENT_MESSAGE` to avoid having to pass in a `dh` instance
// to util functions that only need the event name.
export const DH_WIDGET_EVENT_MESSAGE = 'message' as const;

/**
 * If a remote file system plugin is installed, get an instance of it and set
 * the connection ID.
 * @param cnId connection ID to set on the message stream / connection
 * @param session session to get the plugin from
 * @param workerUrl URL of the Core / Core+ worker
 * @returns a Promise that resolves to the remote file source plugin widget, or
 * null if plugin is not installed
 */
export async function getRemoteFileSourcePlugin(
  cnId: UniqueID,
  session: DhcType.IdeSession,
  workerUrl: URL
): Promise<DhcType.Widget | null> {
  if (
    !(await isPluginInstalled(workerUrl, DH_PYTHON_REMOTE_SOURCE_PLUGIN_NAME))
  ) {
    return null;
  }

  // Initialize the plugin if it is not already initialized.
  await session.runCode(DH_PYTHON_REMOTE_SOURCE_PLUGIN_INIT_SCRIPT);

  const plugin: DhcType.Widget = await session.getObject({
    name: DH_PYTHON_REMOTE_SOURCE_PLUGIN_VARIABLE,
    type: DH_PYTHON_REMOTE_SOURCE_PLUGIN_CLASS,
  });

  const msg: JsonRpcSetConnectionIdRequest = {
    jsonrpc: '2.0',
    id: cnId,
    method: 'set_connection_id',
  };

  await sendWidgetMessageAsync(plugin, msg);

  return plugin;
}

export async function getWorkspaceFileUriMap(
  filePattern: FilePattern,
  ignoreTopLevelFolderNames: Set<FolderName>
): Promise<URIMap<URISet>> {
  const map: URIMap<URISet> = new URIMap();

  for (const ws of vscode.workspace.workspaceFolders ?? []) {
    const fileUriSet = new URISet();

    const fileUris = await vscode.workspace.findFiles(
      new vscode.RelativePattern(ws, filePattern),
      `{${[...ignoreTopLevelFolderNames].join(',')}}/**`
    );

    for (const fileUri of fileUris) {
      fileUriSet.add(fileUri);
    }

    map.set(ws.uri, fileUriSet);
  }

  return map;
}

/**
 * Get a script to set the execution context on the remote file source plugin.
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
  return `${DH_PYTHON_REMOTE_SOURCE_PLUGIN_VARIABLE}.set_execution_context(${connectionIdStr}, ${moduleFullnamesStr})`;
}

/**
 * Check if a plugin is installed on the given worker.
 * @param workerUrl URL of the Core / Core+ worker
 * @param pluginName Name of the plugin to check for
 * @returns Promise that resolves to true if the plugin is installed, false otherwise
 */
export async function isPluginInstalled(
  workerUrl: URL,
  pluginName: string
): Promise<boolean> {
  const pluginsManifestUrl = new URL('/js-plugins/manifest.json', workerUrl);

  try {
    const response = await fetch(pluginsManifestUrl, { method: 'GET' });
    const manifestJson: { plugins: { name: string }[] } = await response.json();

    return manifestJson.plugins.some(plugin => plugin.name === pluginName);
  } catch (err) {
    logger.error('Error checking for remote file source plugin', err);
    return false;
  }
}

/**
 * Register a message listener on the remote file source plugin to handle requests.
 * @param plugin the remote file source plugin widget
 * @param getModuleFilePath a function that returns the file path for a given module fullname
 * @returns a function to unregister the listener
 */
export function registerRemoteFileSourcePluginMessageListener(
  plugin: DhcType.Widget,
  getModuleFilePath: (moduleFullname: ModuleFullname) => vscode.Uri | undefined
): () => void {
  return plugin.addEventListener<DhcType.Widget>(
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
        plugin.sendMessage(JSON.stringify(response));
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
