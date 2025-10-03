import * as vscode from 'vscode';
import { Logger } from '../shared';

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

/**
 * Get a Set of module fullnames for .py files in the current workspace folder.
 * @returns A set of module fullnames.
 */
export async function getPythonModuleFullnames(): Promise<Set<string>> {
  const moduleFullnames = new Set<string>();

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
    moduleFullnames.add(relativePath.replaceAll('/', '.').replace(/\.py$/, ''));
  }

  return moduleFullnames;
}

/**
 * Get a string defining a Python set containing the module fullnames for .py
 * files in the current workspace folder. e.g. '{"module1.aaa","module1.bbb","module2"}'
 * @returns A string defining a Python set.
 */
export async function getPythonModuleFullnamesString(): Promise<string> {
  const moduleFullnames = await getPythonModuleFullnames();
  return `{${[...moduleFullnames].map(modulePath => `"${modulePath}"`).join(',')}}`;
}

/**
 * Get a script to set the execution context on the local execution plugin.
 * @returns A Python script string.
 */
export async function getSetExecutionContextScript(): Promise<string> {
  const moduleFullnamesString = await getPythonModuleFullnamesString();
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
