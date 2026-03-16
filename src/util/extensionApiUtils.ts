import * as vscode from 'vscode';
import type { ExtensionInfo, ExtensionVersion, McpVersion } from '../types';
import { uniqueId } from './idUtils';

const MS_PYTHON_EXTENSION_ID = 'ms-python.python';
const MS_PYTHON_ENVS_EXTENSION_ID = 'ms-python.vscode-python-envs';

/** Microsoft Python extension api */
interface MsPythonExtensionApi {
  environments: {
    getActiveEnvironmentPath: () => Promise<{ path: string }>;
  };
}

/** Options for executing a Python executable */
interface PythonCommandRunConfiguration {
  executable: string;
  args?: string[];
}

/** Execution details for a Python environment */
interface PythonEnvironmentExecutionInfo {
  run: PythonCommandRunConfiguration;
  activatedRun?: PythonCommandRunConfiguration;
  activation?: PythonCommandRunConfiguration[];
  deactivation?: PythonCommandRunConfiguration[];
}

/** Unique identifier for a Python environment */
interface PythonEnvironmentId {
  id: string;
  managerId: string;
}

/** A Python environment from the ms-python.vscode-python-envs extension */
interface PythonEnvironment {
  readonly envId: PythonEnvironmentId;
  readonly name: string;
  readonly displayName: string;
  readonly displayPath: string;
  readonly version: string;
  readonly environmentPath: vscode.Uri;
  readonly execInfo: PythonEnvironmentExecutionInfo;
  readonly sysPrefix: string;
  readonly description?: string;
}

/** Unique identifier for a Python package */
interface PackageId {
  id: string;
  managerId: string;
  environmentId: string;
}

/** A Python package from the ms-python.vscode-python-envs extension */
interface Package {
  readonly pkgId: PackageId;
  readonly name: string;
  readonly displayName: string;
  readonly version?: string;
  readonly description?: string;
}

export enum PackageChangeKind {
  add = 'add',
  remove = 'remove',
}

/** Arguments for the onDidChangePackages event */
interface DidChangePackagesEventArgs {
  environment: PythonEnvironment;
  changes: { kind: PackageChangeKind; pkg: Package }[];
}

export type GetEnvironmentScope = undefined | vscode.Uri;

/** Python Environments extension API (ms-python.vscode-python-envs) */
interface PythonEnvironmentApi {
  getEnvironment(scope: GetEnvironmentScope): Promise<PythonEnvironment | undefined>;
  getPackages(environment: PythonEnvironment): Promise<Package[] | undefined>;
  onDidChangePackages: vscode.Event<DidChangePackagesEventArgs>;
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

/** Get the Python Environments extension api (ms-python.vscode-python-envs) */
export function getPythonEnvsExtensionApi():
  | vscode.Extension<PythonEnvironmentApi>
  | undefined {
  return vscode.extensions.getExtension<PythonEnvironmentApi>(
    MS_PYTHON_ENVS_EXTENSION_ID
  );
}
