import * as vscode from 'vscode';
import { z } from 'zod';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import {
  DhcService,
  getConnectionsForConsoleType,
  type FilteredWorkspace,
} from '../../services';
import { isInstanceOf } from '../../util';
import type { ConnectionState, ConsoleType, IServerManager } from '../../types';

export interface DiagnosticsError {
  uri: string;
  message: string;
  range: vscode.Range;
}

export type VariableResult = z.infer<typeof variableResultSchema>;

/**
 * Schema for variable results returned after code execution.
 */
export const variableResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string(),
  isNew: z
    .boolean()
    .describe('True if the variable was created, false if it was updated'),
});

/**
 * Common output schema for MCP tools that run code.
 */
export const runCodeOutputSchema = {
  success: z.boolean(),
  message: z.string(),
  executionTimeMs: z.number().describe('Execution time in milliseconds'),
  hint: z
    .string()
    .optional()
    .describe(
      'Guidance for resolving errors or suggestions for next steps (e.g., fixing import errors)'
    ),
  details: z
    .object({
      languageId: z
        .string()
        .optional()
        .describe('The language ID used for execution (python or groovy)'),
      foundMatchingFolderUris: z
        .array(z.string())
        .optional()
        .describe(
          'Folder URIs in the workspace that match missing Python module names. Use these exact URIs with addRemoteFileSources to resolve import errors.'
        ),
      panelUrlFormat: z
        .string()
        .optional()
        .describe(
          'URL format for accessing panel variables. Replace <variableTitle> with the variable title.'
        ),
      variables: z
        .array(variableResultSchema)
        .optional()
        .describe('Variables created or updated by the code execution'),
    })
    .optional(),
};

/**
 * Creates a hint for connection not found errors based on available connections.
 * - If hintConnections has items, suggests available connections.
 * - If hintConnections is empty, indicates no available connections for the language.
 * @param serverManager The server manager to query for connections.
 * @param connectionUrl The connection URL that was not found.
 * @param languageId The language ID that the connection should support.
 * @returns A promise that resolves to a hint string describing available alternatives or the issue.
 */
export async function createConnectionNotFoundHint(
  serverManager: IServerManager,
  connectionUrl: string | undefined,
  languageId: string
): Promise<string> {
  const hintConnections = await getConnectionsForConsoleType(
    serverManager.getConnections(),
    languageId as ConsoleType
  );

  if (hintConnections.length > 0) {
    return `Connection for URL ${connectionUrl} not found. Did you mean to use one of these connections?\n${hintConnections
      .map(c => `- ${c.serverUrl.toString()}`)
      .join('\n')}`;
  }

  return `No available connections supporting languageId ${languageId}.`;
}

/**
 * Creates a hint for Python module import errors.
 * - If no import errors are found, returns undefined.
 * - If import errors are found, and remote file source plugin is not installed,
 * suggests installing it.
 * - If import errors are found, and remote file source plugin is installed,
 * determines a list of folder URIs in the workspace that may contain that might
 * satisfy the missing imports.
 * @param errors The list of diagnostic errors.
 * @param connection The connection state to check for Python remote file source plugin.
 * @param pythonWorkspace The filtered Python workspace.
 * @returns An object with hint and foundMatchingFolderUris, or undefined if no hint is applicable.
 */
export function createPythonModuleImportErrorHint(
  errors: Array<{ message: string; uri: string; range: vscode.Range }>,
  connection: ConnectionState,
  pythonWorkspace: FilteredWorkspace
): { hint: string; foundMatchingFolderUris: string[] } | undefined {
  // Look for 'No module named' errors and extract the module names
  const noModuleErrors = new Set(
    errors
      .map(e => /^No module named '([^']+)'/.exec(e.message)?.[1])
      .filter(e => e != null)
  );

  if (noModuleErrors.size === 0) {
    return;
  }

  if (!hasPythonRemoteFileSourcePlugin(connection)) {
    return {
      hint: `The Python remote file source plugin is not installed. Install it with 'pip install deephaven-plugin-python-remote-file-source' to enable importing workspace packages.`,
      foundMatchingFolderUris: [],
    };
  }

  const foundUris: string[] = [];
  const rootNodes = pythonWorkspace.getChildNodes(null);

  for (const rootNode of rootNodes) {
    for (const node of pythonWorkspace.iterateNodeTree(rootNode.uri)) {
      if (node.type === 'folder' && noModuleErrors.has(node.name) && node.uri) {
        foundUris.push(node.uri.toString());
      }
    }
  }

  return {
    hint: 'If this is a package in your workspace, add its folder as a remote file source using addRemoteFileSources. DO NOT guess folder URIs - use the exact URIs provided in details.foundMatchingFolderUris. DO NOT create __init__.py files without first attempting to configure remote file sources.',
    foundMatchingFolderUris: foundUris,
  };
}

/**
 * Checks if the Python remote file source plugin is installed for the given connection.
 * @param connection The connection state to check.
 * @returns True if the Python remote file source plugin is installed, false otherwise.
 */
function hasPythonRemoteFileSourcePlugin(connection: ConnectionState): boolean {
  return (
    isInstanceOf(connection, DhcService) &&
    connection.hasRemoteFileSourcePlugin()
  );
}

/**
 * Extracts variables from a code execution result.
 * Combines both created and updated variables with their metadata.
 * @param result The command result from code execution, or null/undefined.
 * @returns An array of variable results with id, title, type, and isNew flag. Returns empty array if result is null/undefined.
 */
export function extractVariables(
  result: DhcType.ide.CommandResult | null | undefined
): VariableResult[] {
  if (result == null) {
    return [];
  }

  return [
    ...result.changes.created.map(v => ({
      id: String(v.id),
      title: v.title ?? v.id,
      type: v.type,
      isNew: true,
    })),
    ...result.changes.updated.map(v => ({
      id: String(v.id),
      title: v.title ?? v.id,
      type: v.type,
      isNew: false,
    })),
  ];
}

/**
 * Extracts all error-level diagnostics from a diagnostic collection.
 * @param diagnostics The diagnostic collection to extract errors from.
 * @returns An array of diagnostic errors with URI, message, and range information.
 */
export function getDiagnosticsErrors(
  diagnostics: vscode.DiagnosticCollection
): DiagnosticsError[] {
  const diagnosticsMap = new Map([...diagnostics]);
  const errors: DiagnosticsError[] = [];

  for (const [uri, diags] of diagnosticsMap) {
    for (const diag of diags) {
      if (diag.severity === vscode.DiagnosticSeverity.Error) {
        errors.push({
          uri: uri.toString(),
          message: diag.message,
          range: diag.range,
        });
      }
    }
  }

  return errors;
}

/**
 * Formats a diagnostic error as a string for display.
 * @param error The diagnostic error to format.
 * @returns A formatted string including URI, message, and line/character position.
 */
export function formatDiagnosticError(error: DiagnosticsError): string {
  return `${error.uri}: ${error.message} [${error.range.start.line}:${error.range.start.character}]`;
}
