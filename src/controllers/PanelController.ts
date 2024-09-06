import * as vscode from 'vscode';
import type {
  Disposable,
  IPanelService,
  IServerManager,
  VariableDefintion,
} from '../types';
import { getEmbedWidgetUrl } from '../dh/dhc';
import { assertDefined, getDHThemeKey, getPanelHtml, Logger } from '../util';
import { DhcService } from '../services';

const logger = new Logger('PanelController');

export class PanelController implements Disposable {
  constructor(serverManager: IServerManager, panelService: IPanelService) {
    this._panelService = panelService;
    this._serverManager = serverManager;
  }

  private readonly _panelService: IPanelService;
  private readonly _serverManager: IServerManager;

  dispose = async (): Promise<void> => {};

  openPanels = async (
    serverUrl: URL,
    variables: VariableDefintion[]
  ): Promise<void> => {
    logger.debug('openPanels', serverUrl, variables);

    let lastPanel: vscode.WebviewPanel | null = null;

    for (const { id, title } of variables) {
      if (!this._panelService.hasPanel(serverUrl, id)) {
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
  };
}
