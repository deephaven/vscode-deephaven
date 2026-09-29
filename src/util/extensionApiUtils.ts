import * as vscode from 'vscode';
import {
  PythonEnvironments,
  type PythonEnvironment,
  type PythonEnvironmentApi,
} from '@vscode/python-environments';
import type { ExtensionInfo, ExtensionVersion, McpVersion } from '../types';
import { uniqueId } from './idUtils';
import { Logger } from './Logger';

const logger = new Logger('extensionApiUtils');

export {
  PackageChangeKind,
  type PythonEnvironment,
  type PythonEnvironmentApi,
} from '@vscode/python-environments';

/** Create ExtensionInfo from the ExtensionContext */
export function createExtensionInfo(
  context: vscode.ExtensionContext
): ExtensionInfo {
  const instanceId = uniqueId(8);
  const version = getExtensionVersion(context);

  // In development mode, append instanceId to force MCP tool cache refresh per
  // session
  const mcpVersion = (
    context.extensionMode === vscode.ExtensionMode.Development
      ? `${version}-${instanceId}`
      : version
  ) as McpVersion;

  return {
    instanceId,
    version,
    mode: context.extensionMode,
    mcpVersion,
  };
}

/** Get the extension version from the ExtensionContext */
export function getExtensionVersion(
  context: vscode.ExtensionContext
): ExtensionVersion {
  const version = context.extension.packageJSON.version;
  if (typeof version !== 'string') {
    throw new Error('Extension version is not a string');
  }

  return version as ExtensionVersion;
}

/**
 * Get the Python Environments extension api (ms-python.vscode-python-envs).
 * The extension is declared in `extensionDependencies`, but it can still be
 * missing at runtime if the user disabled it, so callers get `undefined` rather
 * than a thrown error. Features that depend on it should degrade gracefully.
 * @returns The api or `undefined` if the extension is unavailable.
 */
export async function getPythonEnvsExtensionApi(): Promise<
  PythonEnvironmentApi | undefined
> {
  try {
    return await PythonEnvironments.api();
  } catch (err) {
    logger.debug('Python Environments extension unavailable:', err);
    return undefined;
  }
}

/**
 * Get the workspace scope to resolve a Python environment against. The Python
 * Environments extension resolves `undefined` to the global scope, which would
 * miss a workspace-local venv, so prefer a workspace folder whenever we can
 * identify one.
 * @returns A workspace folder uri or `undefined` if there is no workspace.
 */
export function getActivePythonScope(): vscode.Uri | undefined {
  const activeUri = vscode.window.activeTextEditor?.document.uri;

  if (activeUri != null) {
    const activeWorkspaceUri =
      vscode.workspace.getWorkspaceFolder(activeUri)?.uri;

    if (activeWorkspaceUri != null) {
      return activeWorkspaceUri;
    }
  }

  // The active editor may be a non-file document (output, settings, etc.) or
  // there may be no editor at all. Fall back to the first workspace folder.
  return vscode.workspace.workspaceFolders?.[0]?.uri;
}

/**
 * Get the Python environment associated with the active workspace scope.
 * @param api The Python Environments extension api.
 * @returns The environment or `undefined` if none is selected.
 */
export async function getActivePythonEnvironment(
  api: PythonEnvironmentApi
): Promise<PythonEnvironment | undefined> {
  return api.getEnvironment(getActivePythonScope());
}
