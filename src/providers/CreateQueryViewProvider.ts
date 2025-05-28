import * as vscode from 'vscode';
import {
  getWebViewHtml,
  Logger,
  registerWebViewThemeHandlers,
  setViewIsVisible,
  showViewContainer,
  withResolvers,
  type PromiseWithResolvers,
} from '../util';
import {
  CLOSE_CREATE_QUERY_VIEW_CMD,
  CREATE_QUERY_SETTINGS_STORAGE_KEY,
  DHE_CREATE_QUERY_URL_PATH,
  QueryCreationCancelledError,
  VIEW_CONTAINER_ID,
  VIEW_ID,
} from '../common';
import type {
  ConsoleType,
  DheAuthenticatedClientWrapper,
  UniqueID,
} from '../types';
import { DisposableBase, type URLMap } from '../services';
import {
  assertDefined,
  DH_POST_MSG,
  VSCODE_POST_MSG,
  type DhAuthTokenRequestMsg,
  type VscodeAuthTokenResponseMsg,
  type ConsoleSettings,
  type DhCreateQueryMsg,
  type QuerySerial,
  type DhSettingsChangedMsg,
  type DhSettingsRequestMsg,
  type VscodeSettingsResponseMsg,
} from '../shared';

const logger = new Logger('CreateQueryViewProvider');

/**
 * Provider for Webview containing "Create Query" panel for DHE.
 */
export class CreateQueryViewProvider
  extends DisposableBase
  implements vscode.WebviewViewProvider
{
  constructor(
    context: vscode.ExtensionContext,
    dheClientCache: URLMap<DheAuthenticatedClientWrapper>
  ) {
    super();
    this._context = context;
    this._dheClientCache = dheClientCache;

    const cmd = vscode.commands.registerCommand(
      CLOSE_CREATE_QUERY_VIEW_CMD,
      () => {
        this.hide();
      }
    );
    this._context.subscriptions.push(cmd);
  }

  private readonly _context: vscode.ExtensionContext;
  private readonly _dheClientCache: URLMap<DheAuthenticatedClientWrapper>;
  private _viewPromiseWithResolvers?: PromiseWithResolvers<vscode.WebviewView>;
  private _activeServerUrl?: URL;
  private _querySerialPromiseWithResolvers?: PromiseWithResolvers<QuerySerial | null>;

  get activeServerUrl(): URL | undefined {
    return this._activeServerUrl;
  }

  createQuery = async (
    serverUrl: URL,
    tagId: UniqueID,
    consoleType?: ConsoleType
  ): Promise<QuerySerial | null> => {
    this._activeServerUrl = serverUrl;

    await this.show();

    const view = await this._viewPromiseWithResolvers?.promise;
    assertDefined(view, 'view');

    updateWebviewView(this._context.extensionUri, view, serverUrl);

    // There are multiple messages that get passed back and forth between DH
    // and the webview as part of creating query workers. This Promise will be
    // resolved once the worker is created and the serial is returned.
    this._querySerialPromiseWithResolvers = withResolvers<QuerySerial | null>();

    let tagVersion = 0;

    const onDidReceiveMessageSubscription = view.webview.onDidReceiveMessage(
      async ({ data, origin }: { data: DhCreateQueryMsg; origin: string }) => {
        // Ignore messages from other origins
        if (origin !== serverUrl.origin) {
          return;
        }

        logger.debug('Received message from webView:', data);

        switch (data.message) {
          case DH_POST_MSG.authTokenRequest:
            const dheClient = this._dheClientCache.get(serverUrl);
            assertDefined(
              dheClient,
              `DheAuthenticatedClient not found for serverUrl: ${serverUrl}`
            );
            await handleAuthTokenRequest(data, dheClient, serverUrl, view);
            break;

          case DH_POST_MSG.settingsChanged:
            handleSettingsChanged(data, this._context);
            break;

          case DH_POST_MSG.settingsRequest:
            tagVersion++;

            // In cases where user cancels the worker creation, add a version
            // suffix to keep the worker name unique while the previous one might
            // still be getting cleaned up. Could also regenerate the unique ID
            // completely, but this adds complexity to the VS Code extension in
            // how the worker info is stored. Seems simpler to version it here.
            const versionedTagId =
              tagVersion === 1
                ? tagId
                : (`${tagId}_v${tagVersion}` as UniqueID);

            handleSettingsRequest(
              data,
              this._context,
              versionedTagId,
              serverUrl,
              view,
              consoleType
            );
            break;

          case DH_POST_MSG.workerCreated:
            this._querySerialPromiseWithResolvers?.resolve(data.payload);
            this._querySerialPromiseWithResolvers = undefined;
            break;

          case DH_POST_MSG.workerCreationCancelled:
            break;
        }
      }
    );

    try {
      return await this._querySerialPromiseWithResolvers.promise;
    } finally {
      onDidReceiveMessageSubscription?.dispose();
      this.hide();
    }
  };

  refresh = async (): Promise<void> => {
    assertDefined(this._activeServerUrl, 'activeServerUrl');

    const view = await this._viewPromiseWithResolvers?.promise;
    assertDefined(view, 'view');

    updateWebviewView(this._context.extensionUri, view, this._activeServerUrl);
  };

  hide = async (): Promise<void> => {
    setViewIsVisible(VIEW_ID.createQuery, false);
    showViewContainer(VIEW_CONTAINER_ID.list);

    if (this._querySerialPromiseWithResolvers) {
      const { promise, reject } = this._querySerialPromiseWithResolvers;
      this._querySerialPromiseWithResolvers = undefined;

      reject(new QueryCreationCancelledError());

      // We need to give a chance for anything awaiting the query serial Promise
      // to handle the `QueryCreationCancelledError`. Otherwise, we might attempt
      // to show the panel again only to have a handler close it on the next tick
      // in response to the error. We catch and ignore the error here, since
      // callers of `hide()` should only care that the hiding logic has completed.
      await promise.catch(() => undefined);
    }
  };

  show = async (): Promise<void> => {
    // If any other query creations have already been started, cancel them
    if (this._querySerialPromiseWithResolvers) {
      await this.hide();
    }

    // Setup the view promise and resolvers
    this._viewPromiseWithResolvers?.reject(
      'show() called before view resolved'
    );
    this._viewPromiseWithResolvers = withResolvers();

    setViewIsVisible(VIEW_ID.createQuery, true);
    showViewContainer(VIEW_CONTAINER_ID.detail);
  };

  resolveWebviewView = (
    webViewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): Thenable<void> | void => {
    this._viewPromiseWithResolvers?.resolve(webViewView);

    assertDefined(this._activeServerUrl, 'activeServerUrl');
    registerWebViewThemeHandlers(webViewView, this._activeServerUrl);
  };
}

/**
 * Handle auth token request from DH iframe.
 * @param msgData Auth token request message
 * @param dheClientWrapper Authenticated DHE client wrapper
 * @param serverUrl URL of the server
 * @param view vscode.WebviewView containing the iframe
 * @returns A promise that resolves when the message is sent to the webview.
 */
async function handleAuthTokenRequest(
  msgData: DhAuthTokenRequestMsg,
  dheClientWrapper: DheAuthenticatedClientWrapper,
  serverUrl: URL,
  view: vscode.WebviewView
): Promise<void> {
  const refreshTokenSerialized = await dheClientWrapper.refreshTokenSerialized;

  assertDefined(refreshTokenSerialized, 'refreshToken');

  const msg: VscodeAuthTokenResponseMsg = {
    id: msgData.id,
    message: VSCODE_POST_MSG.authTokenResponse,
    payload: refreshTokenSerialized,
    targetOrigin: serverUrl.origin,
  };

  logger.debug('Sending msg to webView:', msg);
  view.webview.postMessage(msg);
}

/**
 * Handle settings changed message from DH iframe.
 * @param msgData Settings changed message
 * @param context vscode.ExtensionContext
 * @returns void
 */
function handleSettingsChanged(
  msgData: DhSettingsChangedMsg,
  context: vscode.ExtensionContext
): void {
  logger.debug(
    'Received settings changed message from webView:',
    msgData.payload
  );

  // Store the settings in the global state to use as default for the next
  // worker creation
  context.globalState.update(
    CREATE_QUERY_SETTINGS_STORAGE_KEY,
    msgData.payload
  );
}

/**
 * Handle settings request from DH iframe.
 * @param msgData Settings request message
 * @param context vscode.ExtensionContext
 * @param tagId Unique ID for the tag, used in the worker name
 * @param serverUrl URL of the server
 * @param view vscode.WebviewView containing the iframe
 * @param consoleType Console type to create
 * @returns void
 */
function handleSettingsRequest(
  msgData: DhSettingsRequestMsg,
  context: vscode.ExtensionContext,
  tagId: UniqueID,
  serverUrl: URL,
  view: vscode.WebviewView,
  consoleType?: ConsoleType
): void {
  // Get stored settings from the global state
  const settings: Partial<ConsoleSettings> =
    context.globalState.get(CREATE_QUERY_SETTINGS_STORAGE_KEY) ?? {};

  const newWorkerName = `IC - VS Code${tagId == null ? '' : ` - ${tagId}`}`;

  const msg: VscodeSettingsResponseMsg = {
    id: msgData.id,
    message: VSCODE_POST_MSG.settingsResponse,
    payload: {
      newWorkerName,
      settings: {
        ...settings,
        language: consoleType,
      },
      isLegacyWorkerKindSupported: false,
      showHeader: false,
    },
    targetOrigin: serverUrl.origin,
  };

  view.webview.postMessage(msg);
}

/**
 * Update webview content
 * @param extensionUri Extension URI
 * @param view webview to update
 * @param serverUrl DH server URL
 * @returns void
 */
function updateWebviewView(
  extensionUri: vscode.Uri,
  view: vscode.WebviewView,
  serverUrl: URL
): void {
  const { webview: webView } = view;

  const iframeUrl = new URL(DHE_CREATE_QUERY_URL_PATH, serverUrl);

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
