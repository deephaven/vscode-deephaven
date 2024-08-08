import * as vscode from 'vscode';

/**
 * Ensure url has a trailing slash.
 * @param url
 */
export function ensureHasTrailingSlash(url: string | null) {
  if (url == null) {
    return url;
  }

  return url.endsWith('/') ? url : `${url}/`;
}

/**
 * Get server url and path from a dhfs URI.
 * @param uri
 */
export function getServerUrlAndPath(uri: vscode.Uri) {
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
 * Converts url to `${hostname}_${port}` replacing `.` with `_`
 * @param url The URL to convert
 */
export function urlToDirectoryName(url: string | URL): string {
  if (typeof url === 'string') {
    url = new URL(url);
  }

  return url.host.replace(/[:.]/g, '_');
}
