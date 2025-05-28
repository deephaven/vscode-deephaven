import * as vscode from 'vscode';
import { VIEW_ID_PREFIX, type ViewContainerID, type ViewID } from '../common';
import { uniqueId } from './idUtils';
import { getDHThemeKey } from './uiUtils';
import {
  DH_IFRAME_URL_META_KEY,
  VSCODE_POST_MSG,
  type VscodeGetPropertyMsg,
  type VscodeGetPropertyResponseMsg,
  type VscodePropertyName,
  type VscodeSetThemeRequestMsg,
} from '../shared';

/**
 * Create a property response message.
 * @param id The ID of the message.
 * @param name The name of the property.
 * @returns The property response message.
 */
export function createGetPropertyResponseMsg<TName extends VscodePropertyName>(
  id: string,
  name: TName
): VscodeGetPropertyResponseMsg {
  return {
    id,
    message: VSCODE_POST_MSG.getVscodePropertyResponse,
    payload: {
      name,
      value: getDHThemeKey(),
    },
  };
}

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

  const cspContent = [
    `default-src 'none'`,
    `style-src ${webView.cspSource}`,
    `script-src 'nonce-${nonce}'`,
    `frame-src ${iframeUrl.origin}`,
  ].join('; ');

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="UTF-8">',
    `  <meta http-equiv="Content-Security-Policy" content="${cspContent}">`,
    `  <meta name="${DH_IFRAME_URL_META_KEY}" content="${iframeUrl.href}">`,
    '  <title>DH WebView</title>',
    `  <link rel="stylesheet" href="${styleUri}">`,
    '</head>',
    '<body>',
    `  <script nonce="${nonce}" src="${scriptUri}"></script>`,
    '</body>',
    '</html>',
  ].join('\n');
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

  const messageSubscription = view.webview.onDidReceiveMessage(
    ({ data, origin }: { data: VscodeGetPropertyMsg; origin: string }) => {
      if (origin !== serverUrl.origin) {
        return;
      }

      const { id, payload } = data;

      // Handle `baseThemeKey` property request from webview
      if (
        data.message === VSCODE_POST_MSG.getVscodeProperty &&
        payload === 'baseThemeKey'
      ) {
        view.webview.postMessage(createGetPropertyResponseMsg(id, payload));
      }
    }
  );

  view.onDidDispose(() => {
    colorChangeSubscription.dispose();
    messageSubscription.dispose();
  });
}

/**
 * Show the view container with the given ID.
 * @param viewContainerId The ID of the view container to show.
 */
export function showViewContainer(viewContainerId: ViewContainerID): void {
  vscode.commands.executeCommand(`workbench.view.extension.${viewContainerId}`);
}
