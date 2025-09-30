import * as vscode from 'vscode';
import type { RelativeWsUriString } from '../types';

/**
 * Ensure url has a trailing slash.
 * @param url
 */
export function ensureHasTrailingSlash(url: string | null): string | null {
  if (url == null) {
    return url;
  }

  return url.endsWith('/') ? url : `${url}/`;
}

/**
 * Get server url and path from a dhfs URI.
 * @param uri
 */
export function getServerUrlAndPath(uri: vscode.Uri): {
  root: string;
  path: string;
} {
  // Convert format from:
  // '/https:some-host.com:8123/.vscode/settings.json' to
  // 'https://some-host.com:8123/.vscode/settings.json'
  const urlStr = uri.path.replace(/^(\/)(https?:)/, '$2//');
  const url = new URL(urlStr);

  const root = `${url.protocol}//${url.hostname}:${url.port}`;

  const trailingSlashRegEx = /.(\/)$/;
  const path = url.pathname.replace(trailingSlashRegEx, '');

  return {
    root,
    path,
  };
}

/**
 * Get a workspace relative path for a given uri.
 * @param uri The uri to get the relative path for.
 * @returns The relative path.
 */
export function relativeWsUriString(uri: vscode.Uri): RelativeWsUriString {
  if (uri.fsPath === vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath) {
    return '' as RelativeWsUriString;
  }

  return vscode.workspace.asRelativePath(uri, false) as RelativeWsUriString;
}

/**
 * Converts url to `${hostname}_${port}` replacing `.` with `_`
 * @param url The URL to convert
 */
export function urlToDirectoryName(url: string | URL): string {
  if (typeof url === 'string') {
    url = new URL(url);
  }

  return url.host.replace(/[:.]/g, '_');
}
