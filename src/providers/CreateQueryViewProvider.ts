import * as vscode from 'vscode';
import { type AuthenticatedClient as DheAuthenticatedClient } from '@deephaven-enterprise/auth-nodejs';
import { assertDefined, getWebViewHtml, waitFor } from '../util';
import { VIEW_ID } from '../common';
import type { ConsoleType, IDisposable, QuerySerial, UniqueID } from '../types';
import type { URLMap } from '../services';

export class CreateQueryViewProvider implements vscode.WebviewViewProvider {
  constructor(
    extensionUri: vscode.Uri,
    dheClientCache: URLMap<DheAuthenticatedClient & IDisposable>
  ) {
    this._extensionUri = extensionUri;
    this._dheClientCache = dheClientCache;
  }

  private readonly _extensionUri: vscode.Uri;
  private readonly _dheClientCache: URLMap<
    DheAuthenticatedClient & IDisposable
  >;
  private _view?: vscode.WebviewView;

  createQuery = async (
    serverUrl: URL,
    tagId: UniqueID,
    // TODO: Use this to drive default console type in UI
    _consoleType?: ConsoleType
  ): Promise<QuerySerial | null> => {
    this._updateWebviewView(serverUrl, tagId);

    assertDefined(this._view, '_view');

    const onDidReceiveMessageSubscription =
      this._view.webview.onDidReceiveMessage(({ data, origin }) => {
        // Ignore messages from other origins
        if (origin !== serverUrl.origin) {
          return;
        }
        console.log('[TESTING] Received message from iframe:', data);
      });

    try {
      // TODO: create query and get serial using post message apis
      await waitFor(3000);
    } finally {
      onDidReceiveMessageSubscription?.dispose();
    }

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
