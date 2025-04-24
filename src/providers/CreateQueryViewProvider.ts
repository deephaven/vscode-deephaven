import * as vscode from 'vscode';
import {
  getDHThemeKey,
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
  CREATE_QUERY_POST_MSG_DH,
  CREATE_QUERY_POST_MSG_VSCODE,
  type AuthTokenResponseMsg,
  type ConsoleSettings,
  type CreateQueryMsgDh,
  type SettingsResponseMsgVscode,
} from '../crossModule';

const logger = new Logger('CreateQueryViewProvider');

export class CreateQueryViewProvider
  extends DisposableBase
  implements vscode.WebviewViewProvider
{
  constructor(
    context: vscode.ExtensionContext,
    dheClientCache: URLMap<DheAuthenticatedClient>
  ) {
    super();
    this._context = context;
    this._dheClientCache = dheClientCache;
  }

  private readonly _context: vscode.ExtensionContext;
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

    updateWebviewView(this._context.extensionUri, view, serverUrl);

    const { promise, resolve } = withResolvers<QuerySerial | null>();

    const onDidReceiveMessageSubscription = view.webview.onDidReceiveMessage(
      async ({ data, origin }: { data: CreateQueryMsgDh; origin: string }) => {
        // Ignore messages from other origins
        if (origin !== serverUrl.origin) {
          return;
        }

        logger.debug('Received message from webView:', data);

        if (data.message === CREATE_QUERY_POST_MSG_DH.authTokenRequest) {
          const dheClient = this._dheClientCache.get(serverUrl);

          const refreshTokenSerialized =
            await dheClient?.refreshTokenSerialized;

          assertDefined(refreshTokenSerialized, 'refreshToken');

          const msg: AuthTokenResponseMsg = {
            id: data.id,
            message: CREATE_QUERY_POST_MSG_VSCODE.authTokenResponse,
            payload: refreshTokenSerialized,
            targetOrigin: serverUrl.origin,
          };

          logger.debug('Sending msg to webView:', msg);
          view?.webview.postMessage(msg);
        } else if (data.message === CREATE_QUERY_POST_MSG_DH.settingsChanged) {
          logger.debug(
            'Received settings changed message from webView:',
            data.payload
          );

          this._context.globalState.update('createQuerySettings', data.payload);
        } else if (data.message === CREATE_QUERY_POST_MSG_DH.settingsRequest) {
          const newWorkerName = `IC - VS Code${tagId == null ? '' : ` - ${tagId}`}`;
          const settings: Partial<ConsoleSettings> =
            this._context.globalState.get('createQuerySettings') ?? {};

          const msg: SettingsResponseMsgVscode = {
            id: data.id,
            message: CREATE_QUERY_POST_MSG_VSCODE.settingsResponse,
            payload: {
              newWorkerName,
              settings,
              showHeader: false,
            },
            targetOrigin: serverUrl.origin,
          };

          view?.webview.postMessage(msg);
        } else if (data.message === CREATE_QUERY_POST_MSG_DH.workerCreated) {
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
  serverUrl: URL
): void {
  const { webview: webView } = view;

  const styleContent = `:root{--dh-color-bg: red;}`;

  const inlineTheme = {
    baseThemeKey: getDHThemeKey(),
    themeKey: 'inline',
    name: 'Inline Theme',
    styleContent,
  };

  const iframeUrl = new URL('/iriside/iframecontent/createworker', serverUrl);

  iframeUrl.searchParams.append(
    'theme',
    encodeURIComponent(inlineTheme.themeKey)
  );
  iframeUrl.searchParams.append(
    'inlineTheme',
    encodeURIComponent(JSON.stringify(inlineTheme))
  );

  webView.options = {
    enableScripts: true,
  };

  webView.html = getWebViewHtml({
    extensionUri,
    webView,
    viewId: VIEW_ID.createQuery,
    iframeUrl,
    scriptFileName: 'main.js',
    stylesFileName: 'styles.css',
  });
}
