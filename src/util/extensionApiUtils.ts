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
 * The extension is included in this extension's `extensionPack`, but it can be
 * disabled or uninstalled, so callers get `undefined` rather than a thrown
 * error. Features that depend on it should degrade gracefully.
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
 * Get the scope to resolve a Python environment against. Python Environments
 * resolves a uri to the Python project that contains it, falling back to the
 * workspace folder, so pass a file uri whenever possible. Resolving `undefined`
 * returns the global environment, which would miss a workspace-local venv, so
 * prefer a workspace folder when there is no suitable file.
 * @param uri Uri of the file to resolve the environment for.
 * @returns `uri` if it is in a workspace folder, otherwise the first workspace
 * folder uri, or `undefined` if there is no workspace.
 */
export function getPythonScope(
  uri: vscode.Uri | undefined
): vscode.Uri | undefined {
  if (uri != null && vscode.workspace.getWorkspaceFolder(uri) != null) {
    return uri;
  }

  // The uri may be a non-file document (output, settings, etc.) or there may
  // be no editor at all. Fall back to the first workspace folder.
  return vscode.workspace.workspaceFolders?.[0]?.uri;
}

/**
 * Get the Python environment that applies to a given file.
 * @param api The Python Environments extension api.
 * @param uri Uri of the file to resolve the environment for.
 * @returns The environment or `undefined` if none is selected.
 */
export async function getPythonEnvironment(
  api: PythonEnvironmentApi,
  uri: vscode.Uri | undefined
): Promise<PythonEnvironment | undefined> {
  return api.getEnvironment(getPythonScope(uri));
}
