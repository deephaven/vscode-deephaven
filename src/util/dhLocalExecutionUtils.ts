import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { Logger } from '../shared';
import type { JsonRpcRequest, JsonRpcSuccess } from '../types';

const logger = new Logger('dhLocalExecutionUtils');

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
export const DH_LOCAL_EXECUTION_EVENT_MESSAGE = 'message' as const;

/**
 * Get a Set of module fullnames for .py files in the active workspace folder.
 * @returns A set of module fullnames.
 */
export async function getPythonModuleMap(): Promise<Map<string, vscode.Uri>> {
  const moduleFullnames = new Map<string, vscode.Uri>();

  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) {
    return moduleFullnames;
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(
    activeEditor.document.uri
  );

  if (workspaceFolder == null) {
    return moduleFullnames;
  }

  const uris = await vscode.workspace.findFiles(
    new vscode.RelativePattern(workspaceFolder, '**/*.py'),
    new vscode.RelativePattern(
      workspaceFolder,
      // TODO: We probably need to provide a way to configure this ignore pattern
      '{.venv,venv,env,.env,__pycache__,.git,.mypy_cache,.pytest_cache,.tox,build,dist,*.egg-info}/**'
    )
  );

  for (const uri of uris) {
    const relativePath = vscode.workspace.asRelativePath(uri, false);
    moduleFullnames.set(
      relativePath.replaceAll('/', '.').replace(/\.py$/, ''),
      uri
    );
  }

  return moduleFullnames;
}

/**
 * Get a script to set the execution context on the local execution plugin.
 * @param moduleFullnames An iterable of module fullnames of python files.
 * @returns A Python script string.
 */
export async function getSetExecutionContextScript(
  moduleFullnames: Iterable<string>
): Promise<string> {
  const moduleFullnamesString = `{${[...moduleFullnames].map(modulePath => `"${modulePath}"`).join(',')}}`;
  return `${DH_LOCAL_EXECUTION_PLUGIN_VARIABLE}.set_execution_context(${moduleFullnamesString})`;
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
  getModuleFilePath: (moduleFullname: string) => vscode.Uri | undefined
): () => void {
  return localExecPlugin.addEventListener<DhcType.Widget>(
    DH_LOCAL_EXECUTION_EVENT_MESSAGE,
    async ({ detail }) => {
      try {
        const message: JsonRpcRequest = JSON.parse(detail.getDataAsString());
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
