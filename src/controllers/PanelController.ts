import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import type {
  Disposable,
  IPanelService,
  IServerManager,
  VariableDefintion,
} from '../types';
import { assertDefined, getDHThemeKey, getPanelHtml, Logger } from '../util';
import { DhcService, type URLMap } from '../services';
import {
  OPEN_VARIABLE_PANELS_CMD,
  REFRESH_VARIABLE_PANELS_CMD,
} from '../common';
import { waitFor } from '../util/promiseUtils';
import { getEmbedWidgetUrl } from '../dh/dhc';

const logger = new Logger('PanelController');

export class PanelController implements Disposable {
  constructor(
    coreCredentialsCache: URLMap<() => Promise<DhcType.LoginCredentials>>,
    serverManager: IServerManager,
    panelService: IPanelService
  ) {
    this._coreCredentialsCache = coreCredentialsCache;
    this._panelService = panelService;
    this._serverManager = serverManager;
    this._subscriptions = [];

    this._subscriptions.push(
      vscode.commands.registerCommand(
        OPEN_VARIABLE_PANELS_CMD,
        this._onOpenPanels
      ),
      vscode.commands.registerCommand(
        REFRESH_VARIABLE_PANELS_CMD,
        this._onRefreshPanelsContent
      ),
      vscode.window.onDidChangeActiveColorTheme(
        this._onDidChangeActiveColorTheme
      )
    );
  }

  private readonly _coreCredentialsCache: URLMap<
    () => Promise<DhcType.LoginCredentials>
  >;
  private readonly _panelService: IPanelService;
  private readonly _serverManager: IServerManager;
  private readonly _subscriptions: vscode.Disposable[];

  dispose = async (): Promise<void> => {
    for (const subscription of this._subscriptions) {
      subscription.dispose();
    }
    this._subscriptions.length = 0;
  };

  protected async _onPanelMessage(
    serverOrWorkerUrl: URL,
    { id, message }: { id: string; message: string },
    postResponseMessage: (response: unknown) => void
  ): Promise<void> {
    const workerInfo =
      await this._serverManager.getWorkerInfo(serverOrWorkerUrl);

    if (workerInfo == null) {
      return;
    }

    const credentials =
      await this._coreCredentialsCache.get(serverOrWorkerUrl)?.();

    if (credentials == null) {
      logger.error('Failed to get credentials for worker', serverOrWorkerUrl);
    }

    if (message === 'io.deephaven.message.LoginOptions.request') {
      const response = {
        message: 'vscode-ext.loginOptions',
        payload: {
          id,
          payload: credentials,
        },
        targetOrigin: workerInfo.ideUrl,
      };

      logger.debug('Posting LoginOptions response:', response);

      postResponseMessage(response);

      return;
    }

    if (message === 'io.deephaven.message.SessionDetails.request') {
      const response = {
        message: 'vscode-ext.sessionDetails',
        payload: {
          id,
          payload: {
            workerName: workerInfo.workerName,
            processInfoId: workerInfo.processInfoId,
          },
        },
        targetOrigin: workerInfo.ideUrl,
      };

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

        const subscription = panel.webview.onDidReceiveMessage(({ data }) => {
          const postMessage = panel.webview.postMessage.bind(panel.webview);
          this._onPanelMessage(serverUrl, data, postMessage);
        });

        this._panelService.setPanel(serverUrl, id, panel);

        // If panel gets disposed, remove it from the caches
        panel.onDidDispose(() => {
          this._panelService.deletePanel(serverUrl, id);
          subscription.dispose();
        });
      }

      const panel = this._panelService.getPanelOrThrow(serverUrl, id);
      lastPanel = panel;

      const connection = this._serverManager.getConnection(serverUrl);
      assertDefined(connection, 'connection');

      const iframeUrl = getEmbedWidgetUrl({
        serverUrl,
        title,
        themeKey: getDHThemeKey(),
        psk:
          connection instanceof DhcService
            ? await connection.getPsk()
            : undefined,
      });

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
    this._onRefreshPanelsContent(serverUrl, variables);
  };

  /**
   * Reload the html content for all panels associated with the given server url
   * + variables.
   * @param serverUrl The server url.
   * @param variables Variables identifying the panels to refresh.
   */
  private _onRefreshPanelsContent = async (
    serverUrl: URL,
    variables: VariableDefintion[]
  ): Promise<void> => {
    const connection = this._serverManager.getConnection(serverUrl);
    assertDefined(connection, 'connection');

    const isWorkerUrl = Boolean(
      await this._serverManager.getWorkerInfo(serverUrl)
    );

    for (const { id, title } of variables) {
      const panel = this._panelService.getPanelOrThrow(serverUrl, id);

      const iframeUrl = getEmbedWidgetUrl({
        serverUrl,
        title,
        themeKey: getDHThemeKey(),
        authProvider: isWorkerUrl ? 'parent' : undefined,
        psk:
          connection instanceof DhcService
            ? await connection.getPsk()
            : undefined,
      });

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
