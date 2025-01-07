import * as vscode from 'vscode';
import type {
  ConnectionState,
  IPanelService,
  IServerManager,
  VariableDefintion,
  WorkerURL,
} from '../types';
import {
  assertDefined,
  createLoginOptionsResponsePostMessage,
  createSessionDetailsResponsePostMessage,
  getDHThemeKey,
  getPanelHtml,
  Logger,
} from '../util';
import { DhcService } from '../services';
import {
  DEEPHAVEN_POST_MSG,
  OPEN_VARIABLE_PANELS_CMD,
  REFRESH_VARIABLE_PANELS_CMD,
} from '../common';
import { waitFor } from '../util/promiseUtils';
import { getEmbedWidgetUrl } from '../dh/dhc';
import { ControllerBase } from './ControllerBase';

const logger = new Logger('PanelController');

export class PanelController extends ControllerBase {
  constructor(serverManager: IServerManager, panelService: IPanelService) {
    super();

    this._panelService = panelService;
    this._serverManager = serverManager;

    this.registerCommand(OPEN_VARIABLE_PANELS_CMD, this._onOpenPanels);
    this.registerCommand(
      REFRESH_VARIABLE_PANELS_CMD,
      this._onRefreshPanelsContent
    );

    this.disposables.push(
      vscode.window.onDidChangeActiveColorTheme(
        this._onDidChangeActiveColorTheme
      )
    );
  }

  private readonly _panelService: IPanelService;
  private readonly _serverManager: IServerManager;

  /**
   * Handle `postMessage` messages from the panel.
   * See `getPanelHtml` util for the panel html which wires up the `postMessage`
   * communication between the extension and the DH iframe.
   * @param serverOrWorkerUrl The server or worker url.
   * @param message The message data.
   * @param postResponseMessage The function to post a response message.
   * @returns A promise that resolves when the message has been handled.
   */
  private async _onPanelMessage(
    serverOrWorkerUrl: URL | WorkerURL,
    { id, message }: { id: string; message: string },
    postResponseMessage: (response: unknown) => void
  ): Promise<void> {
    const workerInfo = await this._serverManager.getWorkerInfo(
      serverOrWorkerUrl as WorkerURL
    );

    if (workerInfo == null) {
      return;
    }

    // Respond to login credentials request from DH iframe
    if (message === DEEPHAVEN_POST_MSG.loginOptionsRequest) {
      const credentials =
        await this._serverManager.getWorkerCredentials(serverOrWorkerUrl);

      if (credentials == null) {
        logger.error('Failed to get credentials for worker', serverOrWorkerUrl);
        return;
      }

      const response = createLoginOptionsResponsePostMessage({
        id,
        credentials,
        workerInfo,
      });

      logger.debug('Posting LoginOptions response:', response);

      postResponseMessage(response);

      return;
    }

    // Respond to session details request from DH iframe
    if (message === DEEPHAVEN_POST_MSG.sessionDetailsRequest) {
      const response = createSessionDetailsResponsePostMessage({
        id,
        workerInfo,
      });

      logger.debug('Posting SessionDetails response:', response);

      postResponseMessage(response);

      return;
    }

    logger.debug('Unknown message type', message);
  }

  private _onOpenPanels = async (
    serverUrl: URL,
    variables: VariableDefintion[]
  ): Promise<void> => {
    logger.debug('openPanels', serverUrl, variables);

    // Waiting for next tick seems to decrease the occurrences of a subtle bug
    // where the `editor/title/run` menu gets stuck on a previous selection.
    await waitFor(0);

    let lastPanel: vscode.WebviewPanel | null = null;
    let lastPanelIsNew = false;
    let lastCreatedPanelFirstTimeActiveSubscription: vscode.Disposable | null =
      null;

    for (const variable of variables) {
      const { id, title } = variable;
      if (this._panelService.hasPanel(serverUrl, id)) {
        lastPanelIsNew = false;
      } else {
        lastPanelIsNew = true;

        const panel = vscode.window.createWebviewPanel(
          'dhPanel', // Identifies the type of the webview. Used internally
          title,
          { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
          {
            enableScripts: true,
            retainContextWhenHidden: true,
          }
        );

        // One time subscription to refresh the panel content the first time it
        // becomes active.
        const onFirstTimeActiveSubscription = panel.onDidChangeViewState(
          async ({ webviewPanel }) => {
            if (webviewPanel.active) {
              this._onRefreshPanelsContent(serverUrl, [variable]);
              onFirstTimeActiveSubscription.dispose();
            }
          }
        );
        lastCreatedPanelFirstTimeActiveSubscription =
          onFirstTimeActiveSubscription;

        const onDidReceiveMessageSubscription =
          panel.webview.onDidReceiveMessage(({ data }) => {
            const postMessage = panel.webview.postMessage.bind(panel.webview);
            this._onPanelMessage(serverUrl, data, postMessage);
          });

        this._panelService.setPanel(serverUrl, id, panel);

        // If panel gets disposed, remove it from the cache and dispose subscriptions.
        panel.onDidDispose(() => {
          this._panelService.deletePanel(serverUrl, id);

          onFirstTimeActiveSubscription.dispose();
          onDidReceiveMessageSubscription.dispose();
        });
      }

      const panel = this._panelService.getPanelOrThrow(serverUrl, id);
      lastPanel = panel;
    }

    // Panels get refreshed as follows:
    // 1. Existing panels - don't get updated here. These get refreshed by a
    //    `subscribeToFieldUpdates` handler in DhcService which issues a
    //    `REFRESH_VARIABLE_PANELS_CMD` command for variables matching existing
    //    panels.
    // 2. Newly created panels that are not the initially active panel (aka. any
    //    new panel that is not the last panel in the list) - these get refreshed
    //    the first time the panel becomes active via a one-time
    //    `onDidChangeViewState` handler.
    // 3. Newly created panel that is the initially active panel - this one won't
    //    call the `onDidChangeViewState` handler since it is initialized as
    //    active. For this case, we dispose the one-time `onDidChangeViewState`
    //    subscription and refresh the panel explicitly.
    if (lastPanelIsNew && lastCreatedPanelFirstTimeActiveSubscription) {
      lastCreatedPanelFirstTimeActiveSubscription.dispose();
      this._onRefreshPanelsContent(serverUrl, variables.slice(-1));
    }

    lastPanel?.reveal();
  };

  /**
   * Reload the html content for all panels associated with the given server url
   * + variables.
   * @param serverUrl The server url.
   * @param variables Variables identifying the panels to refresh.
   */
  private _onRefreshPanelsContent = async (
    serverUrl: URL | WorkerURL,
    variables: VariableDefintion[]
  ): Promise<void> => {
    const connection = this._serverManager.getConnection(serverUrl);
    assertDefined(connection, 'connection');

    const isWorkerUrl = Boolean(
      await this._serverManager.getWorkerInfo(serverUrl as WorkerURL)
    );

    for (const { id, title } of variables) {
      const panel = this._panelService.getPanelOrThrow(serverUrl, id);

      const iframeUrl = await getEmbedWidgetUrlForConnection(
        connection,
        title,
        isWorkerUrl
      );

      panel.webview.html = getPanelHtml(iframeUrl, title);
    }
  };

  /**
   * Whenever active theme changes, refresh any open panels.
   */
  private _onDidChangeActiveColorTheme = (): void => {
    for (const url of this._panelService.getPanelUrls()) {
      const variables = this._panelService.getPanelVariables(url);
      this._onRefreshPanelsContent(url, [...variables]);
    }
  };
}

/**
 * Get the embed widget url for a connection. This should probably be moved
 * to some utils location, but it has dependencies on utils, dh, and services
 * so it's not clear where it should go to avoid circular dependencies.
 * @param connection The connection.
 * @param title The title of the widget.
 * @param isWorkerUrl Whether the connection is a worker url.
 * @returns A Promise to the embed widget url.
 */
export async function getEmbedWidgetUrlForConnection(
  connection: ConnectionState,
  title: string,
  isWorkerUrl: boolean
): Promise<URL> {
  return getEmbedWidgetUrl({
    serverUrl: connection.serverUrl,
    title,
    themeKey: getDHThemeKey(),
    // For Core+ workers in DHE, we use `postMessage` apis for auth where DH
    // iframe communicates with parent (the extension) to get login credentials
    // from the DHE client. See `getPanelHtml` util for more details.
    authProvider: isWorkerUrl ? 'parent' : undefined,
    psk:
      connection instanceof DhcService ? await connection.getPsk() : undefined,
  });
}
