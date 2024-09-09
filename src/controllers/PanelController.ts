import * as vscode from 'vscode';
import type {
  Disposable,
  IPanelService,
  IServerManager,
  VariableDefintion,
} from '../types';
import { assertDefined, getDHThemeKey, getPanelHtml, Logger } from '../util';
import { getEmbedWidgetUrl } from '../dh/dhc';
import { DhcService } from '../services';
import {
  OPEN_VARIABLE_PANELS_CMD,
  REFRESH_VARIABLE_PANELS_CMD,
} from '../common';

const logger = new Logger('PanelController');

export class PanelController implements Disposable {
  constructor(serverManager: IServerManager, panelService: IPanelService) {
    this._panelService = panelService;
    this._serverManager = serverManager;
    this._subscriptions = [];

    this._subscriptions.push(
      vscode.commands.registerCommand(
        OPEN_VARIABLE_PANELS_CMD,
        this.onOpenVariablePanels
      ),
      vscode.commands.registerCommand(
        REFRESH_VARIABLE_PANELS_CMD,
        this.onRefreshVariablePanels
      )
    );
  }

  private readonly _panelService: IPanelService;
  private readonly _serverManager: IServerManager;
  private readonly _subscriptions: vscode.Disposable[];

  dispose = async (): Promise<void> => {
    for (const subscription of this._subscriptions) {
      subscription.dispose();
    }
    this._subscriptions.length = 0;
  };

  openPanels = async (
    serverUrl: URL,
    variables: VariableDefintion[]
  ): Promise<void> => {
    logger.debug('openPanels', serverUrl, variables);

    let lastPanel: vscode.WebviewPanel | null = null;

    for (const { id, title } of variables) {
      if (!this._panelService.hasPanel(serverUrl, id)) {
        logger.debug('[TESTING] create panel', serverUrl, id);
        const panel = vscode.window.createWebviewPanel(
          'dhPanel', // Identifies the type of the webview. Used internally
          title,
          { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
          {
            enableScripts: true,
            retainContextWhenHidden: true,
          }
        );

        this._panelService.setPanel(serverUrl, id, panel);

        // If panel gets disposed, remove it from the caches
        panel.onDidDispose(() => {
          this._panelService.deletePanel(serverUrl, id);
        });
      }

      const panel = this._panelService.getPanelOrThrow(serverUrl, id);
      lastPanel = panel;

      const connection = this._serverManager.getConnection(serverUrl);
      assertDefined(connection, 'connection');

      const iframeUrl = getEmbedWidgetUrl(
        serverUrl,
        title,
        getDHThemeKey(),
        connection instanceof DhcService ? connection.getPsk() : undefined
      );

      panel.webview.html = getPanelHtml(iframeUrl, title);

      // TODO: The postMessage apis will be needed for auth in DHE (vscode-deephaven/issues/76).
      // Leaving this here commented out for reference, but it will need some
      // re-working. Namely this seems to subscribe multiple times. Should see
      // if can move it inside of the panel creation block or unsubscribe older
      // subscriptions whenever we subscribe.
      // panel.webview.onDidReceiveMessage(({ data }) => {
      //   const postMessage = panel.webview.postMessage.bind(panel.webview);
      //   this.handlePanelMessage(data, postMessage);
      // });
    }

    lastPanel?.reveal();

    this.refreshPanelsContent(serverUrl, variables);
  };

  /**
   * Reload the html content for all panels associated with the given server url
   * + variables.
   * @param serverUrl The server url.
   * @param variables Variables identifying the panels to refresh.
   */
  refreshPanelsContent = (
    serverUrl: URL,
    variables: VariableDefintion[]
  ): void => {
    const connection = this._serverManager.getConnection(serverUrl);
    assertDefined(connection, 'connection');

    for (const { id, title } of variables) {
      const panel = this._panelService.getPanelOrThrow(serverUrl, id);

      const iframeUrl = getEmbedWidgetUrl(
        serverUrl,
        title,
        getDHThemeKey(),
        connection instanceof DhcService ? connection.getPsk() : undefined
      );

      panel.webview.html = getPanelHtml(iframeUrl, title);
    }
  };

  /**
   * Open panels for given url and variables.
   * @param url Connection url to open panels for.
   * @param variables Variables to open panels for.
   */
  onOpenVariablePanels = (url: URL, variables: VariableDefintion[]): void => {
    this.openPanels(url, variables);
  };

  /**
   * Refresh variable panels for given url and variables.
   * @param url Connection url to refresh panels for.
   * @param variables Variables to refresh panels for.
   */
  onRefreshVariablePanels = (
    url: URL,
    variables: VariableDefintion[]
  ): void => {
    this.refreshPanelsContent(url, variables);
  };
}
