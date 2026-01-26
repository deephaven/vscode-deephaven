import * as vscode from 'vscode';
import type { ExtensionInfo, ExtensionVersion, McpVersion } from '../types';
import { uniqueId } from './idUtils';

const MS_PYTHON_EXTENSION_ID = 'ms-python.python';

/** Microsoft Python extension api */
interface MsPythonExtensionApi {
  environments: {
    getActiveEnvironmentPath: () => Promise<{ path: string }>;
  };
}

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

/** Get Microsoft Python extension api */
export function getMsPythonExtensionApi():
  | vscode.Extension<MsPythonExtensionApi>
  | undefined {
  return vscode.extensions.getExtension<MsPythonExtensionApi>(
    MS_PYTHON_EXTENSION_ID
  );
}
