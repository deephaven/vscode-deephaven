import * as vscode from 'vscode';
import type {
  ConnectionState,
  IPanelService,
  IServerManager,
  VariableDefintion,
  WorkerInfo,
  WorkerURL,
} from '../types';
import {
  createLoginOptionsResponsePostMessage,
  createSessionDetailsResponsePostMessage,
  getDHThemeKey,
  getPanelHtml,
  isDhPanelTab,
  isNonEmptyArray,
  Logger,
} from '../util';
import { DhcService } from '../services';
import {
  CENSORED_TEXT,
  DEBOUNCE_TAB_UPDATE_MS,
  DH_PANEL_VIEW_TYPE,
  OPEN_VARIABLE_PANELS_CMD,
  REFRESH_VARIABLE_PANELS_CMD,
  type OpenVariablePanelsCmdArgs,
  type RefreshVariablePanelsCmdArgs,
} from '../common';
import { waitFor } from '../util/promiseUtils';
import { getEmbedWidgetUrl } from '../dh/dhc';
import { ControllerBase } from './ControllerBase';
import { assertDefined, DH_POST_MSG } from '../shared';

const logger = new Logger('PanelController');

export class PanelController extends ControllerBase {
  constructor(
    extensionUri: vscode.Uri,
    serverManager: IServerManager,
    panelService: IPanelService
  ) {
    super();

    this._extensionUri = extensionUri;
    this._panelService = panelService;
    this._serverManager = serverManager;

    this.registerCommand(OPEN_VARIABLE_PANELS_CMD, this._onOpenPanels);
    this.registerCommand(
      REFRESH_VARIABLE_PANELS_CMD,
      this._onRefreshPanelsContent
    );

    vscode.window.tabGroups.onDidChangeTabs(
      this._debouncedRefreshVisiblePanelsPendingInitialLoad
    );

    this.disposables.push(
      vscode.window.onDidChangeActiveColorTheme(
        this._onDidChangeActiveColorTheme
      )
    );
  }

  private readonly _extensionUri: vscode.Uri;
  private readonly _panelService: IPanelService;
  private readonly _serverManager: IServerManager;

  private readonly _lastPanelInViewColumn = new Map<
    vscode.ViewColumn | undefined,
    vscode.WebviewPanel
  >();
  private readonly _panelsPendingInitialLoad = new Map<
    vscode.WebviewPanel,
    VariableDefintion
  >();

  private _debounceRefreshPanels?: NodeJS.Timeout;

  /**
   * Load any visible panels that are marked for pending initial load. Calls
   * to this method are debounced in case this is called multiple times before
   * the active tab state actually settles. e.g. tab change events may fire
   * multiple times as tabs are removed, added, etc. Also, on slower machines,
   * there may be some latency between when `onDidChangeTabs` fires and
   * `panel.visible` props are updated, so wait long enough to ensure they are
   * current.
   */
  private _debouncedRefreshVisiblePanelsPendingInitialLoad = (): void => {
    clearTimeout(this._debounceRefreshPanels);

    this._debounceRefreshPanels = setTimeout(() => {
      const visiblePanels: {
        url: URL;
        panel: vscode.WebviewPanel;
        variable: VariableDefintion;
      }[] = [];

      // Get details for visible panels that are pending initial load
      for (const url of this._panelService.getPanelUrls()) {
        for (const panel of this._panelService.getPanels(url)) {
          if (panel.visible && this._panelsPendingInitialLoad.has(panel)) {
            const variable = this._panelsPendingInitialLoad.get(panel)!;
            visiblePanels.push({ url, panel, variable });
          }
        }
      }

      vscode.window.tabGroups.all.forEach(tabGroup => {
        if (!isDhPanelTab(tabGroup.activeTab)) {
          return;
        }

        // There doesn't seem to be a way to know which vscode panel is associated
        // with a tab, so best we can do is match the tab label to the panel title.
        // Variable names are not guaranteed to be unique across different servers,
        // so in theory this could include a matching panel from a different
        // server that didn't need to be refreshed. In order for this to happen,
        // the other panel would have to be visible and still pending initial
        // load when the debounce settles on this event which seems extremely rare
        // if even possible. Worst case scenario, we accidentally refresh a panel
        // that doesn't need it which should be fine.
        const matchingPanels = visiblePanels.filter(
          ({ panel }) =>
            panel.viewColumn === tabGroup.viewColumn &&
            panel.title === tabGroup.activeTab?.label
        );

        for (const { url, panel, variable } of matchingPanels) {
          logger.debug2('Loading initial panel content:', panel.title);
          this._panelsPendingInitialLoad.delete(panel);
          this._onRefreshPanelsContent(url, [variable]);
        }
      });
      // See comment on `_debouncedRefreshVisiblePanelsPendingInitialLoad`
    }, DEBOUNCE_TAB_UPDATE_MS);
  };

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
    if (message === DH_POST_MSG.loginOptionsRequest) {
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

      logger.debug('Posting LoginOptions response:', {
        ...response,
        payload: {
          ...response.payload,
          payload: {
            ...response.payload.payload,
            token: CENSORED_TEXT,
          },
        },
      });

      postResponseMessage(response);

      return;
    }

    // Respond to session details request from DH iframe
    if (message === DH_POST_MSG.sessionDetailsRequest) {
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

  /**
   * Ensure panels for given variables are open and queued for loading initial
   * content.
   * @param serverUrl
   * @param variables
   */
  private _onOpenPanels = async (
    ...args: OpenVariablePanelsCmdArgs
  ): Promise<void> => {
    const [serverUrl, variables] = args;
    logger.debug(
      '[_onOpenPanels]',
      serverUrl.href,
      variables.map(v => v.title).join(', ')
    );

    // Waiting for next tick seems to decrease the occurrences of a subtle bug
    // where the `editor/title/run` menu gets stuck on a previous selection.
    await waitFor(0);

    this._lastPanelInViewColumn.clear();

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
            DH_PANEL_VIEW_TYPE, // Identifies the type of the webview. Used internally
            title,
            { viewColumn: targetViewColumn, preserveFocus: true },
            {
              enableScripts: true,
              retainContextWhenHidden: true,
            }
          )
        : this._panelService.getPanelOrThrow(serverUrl, id);

      this._lastPanelInViewColumn.set(panel.viewColumn, panel);
      this._panelsPendingInitialLoad.set(panel, variable);

      if (isNewPanel) {
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

          onDidReceiveMessageSubscription.dispose();
        });
      }
    }

    // Reveal last panel added to each tab group
    for (const panel of this._lastPanelInViewColumn.values()) {
      panel.reveal();
    }

    this._debouncedRefreshVisiblePanelsPendingInitialLoad();
  };

  /**
   * Reload the html content for all panels associated with the given server url
   * + variables.
   * @param serverUrl The server url.
   * @param variables Variables identifying the panels to refresh.
   */
  private _onRefreshPanelsContent = async (
    ...args: RefreshVariablePanelsCmdArgs
  ): Promise<void> => {
    const [serverUrl, variables] = args;
    logger.debug2(
      '[_onRefreshPanelsContent]:',
      serverUrl.href,
      variables.map(v => v.title).join(', ')
    );
    const connection = this._serverManager.getConnection(serverUrl);
    assertDefined(connection, 'connection');

    const workerInfo = await this._serverManager.getWorkerInfo(
      serverUrl as WorkerURL
    );

    for (const variable of variables) {
      const { id, title } = variable;
      const panel = this._panelService.getPanelOrThrow(serverUrl, id);

      // For any panels that are not visible at time of refresh, flag them as
      // pending so that they will be loaded the first time they become visible.
      // We subscribe to `subscribeToFieldUpdates` on the DH connection to respond
      // to server variable updates outside of the extension. This ensures a
      // query that updates a large number of tables doesn't eager load
      // everything in vscode.
      if (!panel.visible) {
        logger.debug2('Panel not visible:', panel.title);
        this._panelsPendingInitialLoad.set(panel, variable);
        continue;
      }

      const iframeUrl = await getEmbedWidgetUrlForConnection(
        connection,
        title,
        workerInfo
      );

      panel.webview.html = getPanelHtml(
        this._extensionUri,
        panel.webview,
        iframeUrl
      );
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
  workerInfo?: WorkerInfo
): Promise<URL> {
  return getEmbedWidgetUrl({
    serverUrl: connection.serverUrl,
    title,
    themeKey: getDHThemeKey(),
    // For Core+ workers in DHE, we use `postMessage` apis for auth where DH
    // iframe communicates with parent (the extension) to get login credentials
    // from the DHE client. See `getPanelHtml` util for more details.
    authProvider: workerInfo == null ? undefined : 'parent',
    envoyPrefix: workerInfo?.envoyPrefix,
    psk:
      connection instanceof DhcService ? await connection.getPsk() : undefined,
  });
}
