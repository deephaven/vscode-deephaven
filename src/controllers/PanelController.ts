import * as vscode from 'vscode';
import type {
  ConnectionState,
  IPanelService,
  IServerManager,
  NonEmptyArray,
  VariableDefintion,
  WorkerURL,
} from '../types';
import {
  assertDefined,
  createLoginOptionsResponsePostMessage,
  createSessionDetailsResponsePostMessage,
  getDHThemeKey,
  getPanelHtml,
  isNonEmptyArray,
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
  private _lastPanel: {
    panel: vscode.WebviewPanel;
    variable: VariableDefintion;
    isNew: boolean;
    hasChangedToVisible: boolean;
  } | null = null;
  private _panelsPendingInitialLoad = new Set<vscode.WebviewPanel>();

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
    variables: NonEmptyArray<VariableDefintion>
  ): Promise<void> => {
    logger.debug(
      '[_onOpenPanels]',
      serverUrl.href,
      variables.map(v => v.title).join(', ')
    );

    // Waiting for next tick seems to decrease the occurrences of a subtle bug
    // where the `editor/title/run` menu gets stuck on a previous selection.
    await waitFor(0);

    this._lastPanel = null;

    // Target ViewColumn is either the first existing panel's viewColumn or a
    // new tab group if none exist.
    const [firstExistingPanel] = this._panelService.getPanels(serverUrl);
    const targetViewColumn =
      firstExistingPanel?.viewColumn ?? vscode.window.tabGroups.all.length + 1;

    for (const variable of variables) {
      const { id, title } = variable;

      const isNewPanel = !this._panelService.hasPanel(serverUrl, id);

      const panel: vscode.WebviewPanel = isNewPanel
        ? vscode.window.createWebviewPanel(
            'dhPanel', // Identifies the type of the webview. Used internally
            title,
            { viewColumn: targetViewColumn, preserveFocus: true },
            {
              enableScripts: true,
              retainContextWhenHidden: true,
            }
          )
        : this._panelService.getPanelOrThrow(serverUrl, id);

      this._lastPanel = {
        panel,
        variable,
        isNew: isNewPanel,
        hasChangedToVisible: false,
      };
      this._panelsPendingInitialLoad.add(panel);

      if (isNewPanel) {
        /**
         * Subscribe to visibility changes on new panels so that we can load data
         * the first time it becomes visible. Initial data will be loaded if
         * 1. The panel is visible.
         * 2. The last panel has been revealed. When multiple panels are being
         *    created, they will start visible and then be hidden as the next
         *    panel is created. We want to wait until all panels have been created
         *    to avoid eager loading every panel along the way.
         * 3. The panel is marked as pending initial load.
         */
        const onDidChangeViewStateSubscription = panel.onDidChangeViewState(
          ({ webviewPanel }) => {
            logger.debug2(
              `[onDidChangeViewState]: ${webviewPanel.title}`,
              `active:${webviewPanel.active},visible:${webviewPanel.visible}`
            );

            if (!webviewPanel.visible || this._lastPanel == null) {
              return;
            }

            if (
              this._lastPanel.panel === webviewPanel &&
              !this._lastPanel.hasChangedToVisible
            ) {
              logger.debug2(
                webviewPanel.title,
                'Last panel has changed to visible'
              );
              this._lastPanel.hasChangedToVisible = true;
            }

            if (!this._lastPanel.hasChangedToVisible) {
              logger.debug2(webviewPanel.title, 'Waiting for last panel');
              return;
            }

            if (!this._panelsPendingInitialLoad.has(webviewPanel)) {
              logger.debug2(webviewPanel.title, 'Panel already loaded');
              return;
            }

            logger.debug2(webviewPanel.title, 'Loading initial panel content');
            this._panelsPendingInitialLoad.delete(webviewPanel);
            this._onRefreshPanelsContent(serverUrl, [variable]);
          }
        );

        const onDidReceiveMessageSubscription =
          panel.webview.onDidReceiveMessage(({ data }) => {
            const postMessage = panel.webview.postMessage.bind(panel.webview);
            this._onPanelMessage(serverUrl, data, postMessage);
          });

        this._panelService.setPanel(serverUrl, id, panel);

        // If panel gets disposed, remove it from the cache and dispose subscriptions.
        panel.onDidDispose(() => {
          // IMPORTANT: Don't try to access any panel properties here as they
          // can cause exceptions if the panel has already been disposed.
          logger.debug2('Panel disposed:', title);

          this._panelService.deletePanel(serverUrl, id);
          this._panelsPendingInitialLoad.delete(panel);

          onDidChangeViewStateSubscription.dispose();
          onDidReceiveMessageSubscription.dispose();
        });
      }
    }

    assertDefined(this._lastPanel, '_lastPanel');

    this._lastPanel.panel.reveal();

    // If the last panel already exists, it may not fire a `onDidChangeViewState`
    // event, so eagerly refresh it since we know it will be visible.
    if (!this._lastPanel.isNew) {
      logger.debug2('Refreshing last panel:', this._lastPanel.panel.title);
      this._panelsPendingInitialLoad.delete(this._lastPanel.panel);
      this._onRefreshPanelsContent(serverUrl, [this._lastPanel.variable]);
    }
  };

  /**
   * Reload the html content for all panels associated with the given server url
   * + variables.
   * @param serverUrl The server url.
   * @param variables Variables identifying the panels to refresh.
   */
  private _onRefreshPanelsContent = async (
    serverUrl: URL | WorkerURL,
    variables: NonEmptyArray<VariableDefintion>
  ): Promise<void> => {
    logger.debug2(
      '[_onRefreshPanelsContent]:',
      serverUrl.href,
      variables.map(v => v.title).join(', ')
    );
    const connection = this._serverManager.getConnection(serverUrl);
    assertDefined(connection, 'connection');

    const isWorkerUrl = Boolean(
      await this._serverManager.getWorkerInfo(serverUrl as WorkerURL)
    );

    for (const { id, title } of variables) {
      const panel = this._panelService.getPanelOrThrow(serverUrl, id);

      // For any panels that are not visible at time of refresh, flag them as
      // pending so that they will be loaded the first time they become visible.
      // We subscribe to `subscribeToFieldUpdates` on the DH connection to respond
      // to server variable updates outside of the extension. This ensures a
      // query that updates a large number of tables doesn't eager load
      // everything in vscode.
      if (!panel.visible) {
        logger.debug2('Panel not visible:', panel.title);
        this._panelsPendingInitialLoad.add(panel);
        continue;
      }

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
      if (isNonEmptyArray(variables)) {
        this._onRefreshPanelsContent(url, variables);
      }
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
