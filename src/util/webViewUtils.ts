import * as vscode from 'vscode';
import { VIEW_ID_PREFIX, type ViewContainerID, type ViewID } from '../common';
import { uniqueId } from './idUtils';
import { getDHThemeKey } from './uiUtils';
import { VSCODE_POST_MSG, type VscodeSetThemeRequestMsg } from '../crossModule';

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
    viewId.replace(VIEW_ID_PREFIX, '')
  );
}

/**
 * Get HTML for a VS Code WebView
 * @param extensionUri The extension Uri
 * @param webview The WebView to get the HTML for
 * @param viewId The view ID for the WebView
 * @param iframeUrl URL to load in an iframe
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

  const baseDhThemeKey = getDHThemeKey();

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
        <meta name="dh-base-theme-key" content="${baseDhThemeKey}">
        <meta name="dh-iframe-url" content="${iframeUrl.href}">
				<title>DH WebView</title>
				<link rel="stylesheet" href="${styleUri}">
			</head>
			<body>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
}

/**
 * Register handlers for theme related messages in a WebView.
 * @param view
 * @param serverUrl
 */
export function registerWebViewThemeHandlers(
  view: vscode.WebviewView,
  serverUrl: URL
): void {
  const colorChangeSubscription = vscode.window.onDidChangeActiveColorTheme(
    () => {
      const msg: VscodeSetThemeRequestMsg = {
        id: uniqueId(),
        message: VSCODE_POST_MSG.requestSetTheme,
        payload: getDHThemeKey(),
        targetOrigin: serverUrl.origin,
      };

      view.webview.postMessage(msg);
    }
  );

  view.onDidDispose(() => {
    colorChangeSubscription.dispose();
  });
}

/**
 * Show the view container with the given ID.
 * @param viewContainerId The ID of the view container to show.
 */
export function showViewContainer(viewContainerId: ViewContainerID): void {
  vscode.commands.executeCommand(`workbench.view.extension.${viewContainerId}`);
}
