import * as vscode from 'vscode';
import {
  getWebViewHtml,
  Logger,
  setViewIsVisible,
  showViewContainer,
  withResolvers,
} from '../util';
import { VIEW_CONTAINER_ID, VIEW_ID } from '../common';
import type {
  ConsoleType,
  DheAuthenticatedClient,
  QuerySerial,
  UniqueID,
} from '../types';
import { DisposableBase, type URLMap } from '../services';
import {
  assertDefined,
  DEEPHAVEN_POST_MSG,
  VSCODE_POST_MSG,
} from '../crossModule';

const logger = new Logger('CreateQueryViewProvider');

export class CreateQueryViewProvider
  extends DisposableBase
  implements vscode.WebviewViewProvider
{
  constructor(
    extensionUri: vscode.Uri,
    dheClientCache: URLMap<DheAuthenticatedClient>
  ) {
    super();
    this._extensionUri = extensionUri;
    this._dheClientCache = dheClientCache;
  }

  private readonly _extensionUri: vscode.Uri;
  private readonly _dheClientCache: URLMap<DheAuthenticatedClient>;
  private _viewPromise?: Promise<vscode.WebviewView>;
  private _activeServerUrl?: URL;

  get activeServerUrl(): URL | undefined {
    return this._activeServerUrl;
  }

  createQuery = async (
    serverUrl: URL,
    tagId: UniqueID,
    // TODO: Use this to drive default console type in UI
    _consoleType?: ConsoleType
  ): Promise<QuerySerial | null> => {
    this._activeServerUrl = serverUrl;

    const { promise: viewPromise, resolve: resolveView } =
      withResolvers<vscode.WebviewView>();

    this._viewPromise = viewPromise;
    this._resolveView = resolveView;

    this.show();

    const view = await this._viewPromise;
    assertDefined(view, 'view');

    updateWebviewView(this._extensionUri, view, serverUrl, tagId);

    const { promise, resolve } = withResolvers<QuerySerial | null>();

    const onDidReceiveMessageSubscription = view.webview.onDidReceiveMessage(
      async ({ data, origin }) => {
        // Ignore messages from other origins
        if (origin !== serverUrl.origin) {
          return;
        }

        logger.debug('Received message from webView:', data);

        if (data.message === DEEPHAVEN_POST_MSG.authTokenRequest) {
          const dheClient = this._dheClientCache.get(serverUrl);

          const refreshTokenSerialized =
            await dheClient?.refreshTokenSerialized;

          assertDefined(refreshTokenSerialized, 'refreshToken');

          const { bytes, expiry } = refreshTokenSerialized;

          const msg = {
            id: data.id,
            message: VSCODE_POST_MSG.authTokenResponse,
            payload: { bytes, expiry },
            targetOrigin: serverUrl.origin,
          };

          logger.debug('Sending msg to webView:', msg);
          view?.webview.postMessage(msg);
        } else if (data.message === DEEPHAVEN_POST_MSG.workerCreated) {
          resolve(data.payload);
        }
      }
    );

    try {
      return await promise;
    } finally {
      onDidReceiveMessageSubscription?.dispose();
      this.hide();
    }
  };

  hide = (): void => {
    setViewIsVisible(VIEW_ID.createQuery, false);
    showViewContainer(VIEW_CONTAINER_ID.list);
  };

  show = (): void => {
    setViewIsVisible(VIEW_ID.createQuery, true);
    showViewContainer(VIEW_CONTAINER_ID.detail);
  };

  private _resolveView?: (view: vscode.WebviewView) => void;

  resolveWebviewView = (
    webViewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): Thenable<void> | void => {
    this._resolveView?.(webViewView);
  };
}

function updateWebviewView(
  extensionUri: vscode.Uri,
  view: vscode.WebviewView,
  serverUrl: URL,
  tagId?: UniqueID
): void {
  const { webview: webView } = view;

  let iframeUrl: URL | undefined;

  const newWorkerName = `IC - VS Code${tagId == null ? '' : ` - ${tagId}`}`;

  iframeUrl = new URL('/iriside/iframecontent/createworker', serverUrl);
  iframeUrl.searchParams.append(
    'newWorkerName',
    encodeURIComponent(newWorkerName)
  );

  webView.options = {
    enableScripts: true,
  };

  webView.html = getWebViewHtml({
    extensionUri,
    webView,
    viewId: VIEW_ID.createQuery,
    iframeUrl,
    content: 'Click a server in the SERVERS view to create a query',
    scriptFileName: 'main.js',
    stylesFileName: 'styles.css',
  });
}
