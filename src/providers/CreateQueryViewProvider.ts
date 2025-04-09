import * as vscode from 'vscode';
import { assertDefined, getWebViewHtml, waitFor } from '../util';
import { VIEW_ID } from '../common';
import type { QuerySerial, UniqueID } from '../types';

export class CreateQueryViewProvider implements vscode.WebviewViewProvider {
  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
  }

  private readonly _extensionUri: vscode.Uri;
  private _view?: vscode.WebviewView;

  createQuery = async (
    serverUrl: URL,
    tagId: UniqueID
  ): Promise<QuerySerial | null> => {
    this._updateWebviewView(serverUrl, tagId);

    // TODO: create query and get serial using post message apis
    await waitFor(3000);

    this.hide();

    return null;
  };

  hide = (): void => {
    this._updateWebviewView();
  };

  resolveWebviewView = (
    webViewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): Thenable<void> | void => {
    this._view = webViewView;
    this._updateWebviewView();
  };

  _updateWebviewView = (serverUrl?: URL, tagId?: UniqueID): void => {
    assertDefined(this._view, '_view');

    const { webview: webView } = this._view;

    let iframeUrl: URL | undefined;

    if (serverUrl != null) {
      const newWorkerName = `IC - VS Code${tagId == null ? '' : ` - ${tagId}`}`;

      iframeUrl = new URL('/iriside/iframecontent/createworker', serverUrl);
      iframeUrl.searchParams.append(
        'newWorkerName',
        encodeURIComponent(newWorkerName)
      );
    }

    webView.options = {
      enableScripts: true,
    };

    webView.html = getWebViewHtml({
      extensionUri: this._extensionUri,
      webView,
      viewId: VIEW_ID.createQueryView,
      iframeUrl,
      content: 'Click a server in the SERVERS view to create a query',
      scriptFileName: 'main.js',
      stylesFileName: 'styles.css',
    });
  };
}
