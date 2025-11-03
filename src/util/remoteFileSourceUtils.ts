import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { URIMap } from './maps';
import type {
  FilePattern,
  FolderName,
  Include,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcSetConnectionIdRequest,
  JsonRpcSuccess,
  ModuleFullname,
  PythonModuleSpecData,
  RemoteImportSourceTreeFileElement,
  RemoteImportSourceTreeFolderElement,
  RemoteImportSourceTreeTopLevelMarkedFolderElement,
  UniqueID,
} from '../types';
import { withResolvers } from './promiseUtils';
import { URISet } from './sets';
import {
  DH_PYTHON_REMOTE_SOURCE_PLUGIN_CLASS,
  DH_PYTHON_REMOTE_SOURCE_PLUGIN_VARIABLE,
  DH_PYTHON_REMOTE_SOURCE_PLUGIN_NAME,
} from '../common';
import { Logger } from './Logger';

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

/**
 * Get `TreeItem` for a file element in the remote import source tree.
 * @param element The file element.
 * @returns TreeItem for the file
 */
export function getFileTreeItem({
  name,
  uri,
}: RemoteImportSourceTreeFileElement): vscode.TreeItem {
  return {
    label: name,
    resourceUri: uri,
    collapsibleState: vscode.TreeItemCollapsibleState.None,
    command: {
      title: 'Open File',
      command: 'vscode.open',
      arguments: [uri],
    },
  };
}

/**
 * Get `TreeItem` for a folder element in the remote import source tree.
 * @param element The folder element.
 * @returns TreeItem for the folder
 */
export function getFolderTreeItem({
  name,
  isMarked,
  uri,
}: RemoteImportSourceTreeFolderElement): vscode.TreeItem {
  return {
    label: name,
    collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
    resourceUri: uri,
    contextValue: isMarked
      ? 'canRemoveRemoteFileSource'
      : 'canAddRemoteFileSource',
    iconPath: new vscode.ThemeIcon('folder'),
  };
}

/**
 * Get `TreeItem` for a top-level marked folder element in the remote import
 * source tree.
 * @param element The top-level marked folder element.
 * @returns TreeItem for the top-level marked folder
 */
export function getTopLevelMarkedFolderTreeItem({
  uri,
}: RemoteImportSourceTreeTopLevelMarkedFolderElement): vscode.TreeItem {
  return {
    label: uri.path.split('/').at(-1),
    description: vscode.workspace.asRelativePath(uri, true),
    contextValue: 'canRemoveRemoteFileSource',
    resourceUri: uri,
    iconPath: new vscode.ThemeIcon('dh-python'),
    collapsibleState: vscode.TreeItemCollapsibleState.None,
  };
}

/**
 * Get the top-level Python module name for a given folder URI. It will be the
 * last segment of the folder path.
 * @param folderUri The folder URI.
 * @returns The top-level module name.
 */
export function getTopLevelModuleFullname(
  folderUri: vscode.Uri
): ModuleFullname {
  return folderUri.path.replace(/\/$/, '').split('/').at(-1) as ModuleFullname;
}

/**
 * Get a map of workspace folder URIs to sets of file URIs matching the given
 * file pattern, ignoring files in top-level folders with names in the ignore
 * set.
 * @param filePattern The glob pattern to match files against.
 * @param ignoreTopLevelFolderNames A set of top-level folder names to ignore.
 * @returns A Promise that resolves to a map of workspace folder URIs to sets of file URIs.
 */
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
 * @param getPythonModuleSpecData a function that returns the module spec data
 * for a given module fullname
 * @returns a function to unregister the listener
 */
export function registerRemoteFileSourcePluginMessageListener(
  plugin: DhcType.Widget,
  getPythonModuleSpecData: (
    moduleFullname: ModuleFullname
  ) => PythonModuleSpecData | undefined
): () => void {
  return plugin.addEventListener<DhcType.Widget>(
    DH_WIDGET_EVENT_MESSAGE,
    async ({ detail }) => {
      try {
        const message: JsonRpcRequest = JSON.parse(detail.getDataAsString());
        if (message.method !== 'fetch_module') {
          return;
        }

        logger.info('Received message from server:', message);

        const moduleSpecData = getPythonModuleSpecData(
          message.params.module_name
        );

        if (moduleSpecData == null) {
          const errorResponse = {
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32602, // Invalid params error code
              message: `Module not found: ${message.params.module_name}`,
            },
          };
          logger.error('Sending error response to server:', errorResponse);
          plugin.sendMessage(JSON.stringify(errorResponse));
          return;
        }

        const { name, isPackage, origin, subModuleSearchLocations } =
          moduleSpecData;

        let source: string | undefined;
        if (origin != null) {
          const textDoc = await vscode.workspace.openTextDocument(origin);
          source = textDoc.getText();
        }

        const response: JsonRpcSuccess = {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            name,
            origin,
            /* eslint-disable @typescript-eslint/naming-convention */
            is_package: isPackage,
            submodule_search_locations: subModuleSearchLocations,
            /* eslint-enable @typescript-eslint/naming-convention */
            source,
          },
        };

        logger.info('Sending response to server:', response);
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
