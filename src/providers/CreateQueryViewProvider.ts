import * as vscode from 'vscode';
import { getWebViewContentRootUri, uniqueId } from '../util';
import { VIEW_ID } from '../common';

export class CreateQueryViewProvider implements vscode.WebviewViewProvider {
  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
  }

  private readonly _extensionUri: vscode.Uri;

  resolveWebviewView(
    { webview }: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): Thenable<void> | void {
    const nonce = uniqueId();

    const contentRootUri = getWebViewContentRootUri(
      this._extensionUri,
      VIEW_ID.createQueryView
    );

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(contentRootUri, 'main.js')
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(contentRootUri, 'styles.css')
    );

    const newWorkerName = `VS Code - ${uniqueId()}`;

    const iframeUrl = new URL(
      'http://localhost:3000/iriside/iframecontent/createworker'
    );
    iframeUrl.searchParams.append(
      'newWorkerName',
      encodeURIComponent(newWorkerName)
    );

    webview.options = {
      enableScripts: true,
    };

    webview.html = `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; frame-src ${iframeUrl.origin};">
				<title>Create Connection</title>
				<link rel="stylesheet" href="${styleUri}">
			</head>
			<body>
				<script nonce="${nonce}" src="${scriptUri}"></script>
				<iframe id="content-iframe" src="${iframeUrl.href}&cachebust=${new Date().getTime()}" title="Create Connection"></iframe>
			</body>
			</html>`;
  }
}
