import * as vscode from 'vscode';
import { EXTENSION_ID, type ViewID } from '../common';
import { uniqueId } from './idUtils';

/**
 * Get Uri root containing content for a WebView.
 * @param extensionUri The extension Uri.
 * @param viewId The view id to get the content for.
 * @returns A Uri to the content root.
 */
export function getWebViewContentRootUri(
  extensionUri: vscode.Uri,
  viewId: ViewID
): vscode.Uri {
  return vscode.Uri.joinPath(
    extensionUri,
    'out',
    'webViews',
    viewId.replace(`${EXTENSION_ID}.`, '')
  );
}

/**
 * Get HTML for a VS Code WebView
 * @param extensionUri The extension Uri
 * @param webview The WebView to get the HTML for
 * @param viewId The view ID for the WebView
 * @param iframeUrl The URL to load in the iframe
 * @param scriptFileName Filename for the script to apply to the WebView
 * @param stylesFileName Filename for the style sheet to apply to the WebView
 * @returns The HTML for the WebView
 */
export function getWebViewHtml({
  extensionUri,
  webView,
  viewId,
  iframeUrl,
  scriptFileName,
  stylesFileName,
}: {
  extensionUri: vscode.Uri;
  webView: vscode.Webview;
  viewId: ViewID;
  iframeUrl: URL;
  scriptFileName: `${string}.js`;
  stylesFileName: `${string}.css`;
}): string {
  const nonce = uniqueId();

  const contentRootUri = getWebViewContentRootUri(extensionUri, viewId);

  const scriptUri = webView.asWebviewUri(
    vscode.Uri.joinPath(contentRootUri, scriptFileName)
  );

  const styleUri = webView.asWebviewUri(
    vscode.Uri.joinPath(contentRootUri, stylesFileName)
  );

  const cspContent = [
    `default-src 'none'`,
    `style-src ${webView.cspSource}`,
    `script-src 'nonce-${nonce}'`,
    `frame-src ${iframeUrl.origin}`,
  ].join('; ');

  return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta http-equiv="Content-Security-Policy" content="${cspContent}">
				<title>Create Connection</title>
				<link rel="stylesheet" href="${styleUri}">
			</head>
			<body>
				<script nonce="${nonce}" src="${scriptUri}"></script>
				<iframe id="content-iframe" src="${iframeUrl.href}&cachebust=${new Date().getTime()}" title="Create Connection"></iframe>
			</body>
			</html>`;
}
