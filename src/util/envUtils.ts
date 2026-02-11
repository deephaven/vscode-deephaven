import * as vscode from 'vscode';

/**
 * Check if the current VS Code environment is Windsurf.
 * @returns True if running in Windsurf, false otherwise.
 */
export function isWindsurf(): boolean {
  return vscode.env.appName.toLowerCase().includes('windsurf');
}

/**
 * Get the URI for the Windsurf MCP config file.
 * @returns URI for the Windsurf MCP config file in the user's home directory.
 */
export function getWindsurfMcpConfigUri(): vscode.Uri {
  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '';
  return vscode.Uri.file(`${homeDir}/.codeium/windsurf/mcp_config.json`);
}
