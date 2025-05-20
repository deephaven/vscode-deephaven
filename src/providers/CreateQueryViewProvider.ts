import * as vscode from 'vscode';
import {
  getWebViewHtml,
  Logger,
  registerWebViewThemeHandlers,
  setViewIsVisible,
  showViewContainer,
  withResolvers,
} from '../util';
import {
  CLOSE_CREATE_QUERY_VIEW_CMD,
  CREATE_QUERY_SETTINGS_STORAGE_KEY,
  DHE_CREATE_QUERY_URL_PATH,
  QueryCreationCancelledError,
  VIEW_CONTAINER_ID,
  VIEW_ID,
} from '../common';
import type { ConsoleType, DheAuthenticatedClient, UniqueID } from '../types';
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
} from '../crossModule';

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
    dheClientCache: URLMap<DheAuthenticatedClient>
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
  private readonly _dheClientCache: URLMap<DheAuthenticatedClient>;
  private _viewPromise?: Promise<vscode.WebviewView>;
  private _activeServerUrl?: URL;
  private _rejectQuerySerial?: (reason?: any) => void;

  get activeServerUrl(): URL | undefined {
    return this._activeServerUrl;
  }

  createQuery = async (
    serverUrl: URL,
    tagId: UniqueID,
    consoleType?: ConsoleType
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

    // There are multiple messages that get passed back and forth between DH
    // and the webview as part of creating query workers. This Promise will be
    // resolved once the worker is created and the serial is returned.
    const {
      promise: querySerialPromise,
      resolve: resolveQuerySerial,
      reject: rejectQuerySerial,
    } = withResolvers<QuerySerial | null>();

    this._rejectQuerySerial = rejectQuerySerial;

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
            this._rejectQuerySerial = undefined;
            resolveQuerySerial(data.payload);
            break;

          case DH_POST_MSG.workerCreationCancelled:
            break;
        }
      }
    );

    try {
      return await querySerialPromise;
    } finally {
      onDidReceiveMessageSubscription?.dispose();
      this.hide();
    }
  };

  refresh = async (): Promise<void> => {
    assertDefined(this._activeServerUrl, 'activeServerUrl');

    const view = await this._viewPromise;
    assertDefined(view, 'view');

    updateWebviewView(this._context.extensionUri, view, this._activeServerUrl);
  };

  hide = (): void => {
    setViewIsVisible(VIEW_ID.createQuery, false);
    showViewContainer(VIEW_CONTAINER_ID.list);

    this._rejectQuerySerial?.(new QueryCreationCancelledError());
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

    assertDefined(this._activeServerUrl, 'activeServerUrl');
    registerWebViewThemeHandlers(webViewView, this._activeServerUrl);
  };
}

/**
 * Handle auth token request from DH iframe.
 * @param msgData Auth token request message
 * @param dheClient Authenticated DHE client
 * @param serverUrl URL of the server
 * @param view vscode.WebviewView containing the iframe
 * @returns A promise that resolves when the message is sent to the webview.
 */
async function handleAuthTokenRequest(
  msgData: DhAuthTokenRequestMsg,
  dheClient: DheAuthenticatedClient,
  serverUrl: URL,
  view: vscode.WebviewView
): Promise<void> {
  const refreshTokenSerialized = await dheClient.refreshTokenSerialized;

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
