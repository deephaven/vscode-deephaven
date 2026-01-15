import * as vscode from 'vscode';

/**
 * Check if the current VS Code environment is Windsurf.
 * @returns True if running in Windsurf, false otherwise.
 */
export function isWindsurf(): boolean {
  return vscode.env.appName.toLowerCase().includes('windsurf');
}
