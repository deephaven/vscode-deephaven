import * as vscode from 'vscode';
import { getWebViewHtml, uniqueId } from '../util';
import { VIEW_ID } from '../common';

export class CreateQueryViewProvider implements vscode.WebviewViewProvider {
  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
  }

  private readonly _extensionUri: vscode.Uri;

  resolveWebviewView(
    { webview: webView }: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): Thenable<void> | void {
    const newWorkerName = `VS Code - ${uniqueId()}`;

    const iframeUrl = new URL(
      'http://localhost:3000/iriside/iframecontent/createworker'
    );
    iframeUrl.searchParams.append(
      'newWorkerName',
      encodeURIComponent(newWorkerName)
    );

    webView.options = {
      enableScripts: true,
    };

    webView.html = getWebViewHtml({
      extensionUri: this._extensionUri,
      webView,
      viewId: VIEW_ID.createQueryView,
      iframeUrl,
      scriptFileName: 'main.js',
      stylesFileName: 'styles.css',
    });
  }
}
