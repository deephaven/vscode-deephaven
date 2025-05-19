import * as vscode from 'vscode';
import { EXTENSION_ID, type ViewID } from '../common';
import { uniqueId } from './idUtils';
import { CONTENT_IFRAME_ID } from '../crossModule';

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
 * @param iframeUrl Optional URL to load in an iframe. If not provided, no iframe
 * will be created
 * @param content Optional content to load in the WebView. If an iframe URL is
 * provided, this will be ignored
 * @param scriptFileName Filename for the script to apply to the WebView
 * @param stylesFileName Filename for the style sheet to apply to the WebView
 * @returns The HTML for the WebView
 */
export function getWebViewHtml({
  extensionUri,
  webView,
  viewId,
  iframeUrl,
  content,
  scriptFileName,
  stylesFileName,
}: {
  extensionUri: vscode.Uri;
  webView: vscode.Webview;
  viewId: ViewID;
  iframeUrl?: URL;
  content?: string;
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

  let cspContent = [
    `default-src 'none'`,
    `style-src ${webView.cspSource}`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  const contentTag =
    content == null ? null : `<div id="content">${content}</div>`;

  let iframeTag: string | undefined;
  if (iframeUrl != null) {
    cspContent += `; frame-src ${iframeUrl.origin}`;
    iframeTag = `<iframe id="${CONTENT_IFRAME_ID}" src="${iframeUrl.href}&cachebust=${new Date().getTime()}"></iframe>`;
  }

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
				${iframeTag ?? contentTag}
			</body>
			</html>`;
}
