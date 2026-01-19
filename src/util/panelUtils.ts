import * as vscode from 'vscode';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { DH_PANEL_VIEW_TYPE, VIEW_ID } from '../common';
import type {
  LoginOptionsResponsePostMessage,
  SessionDetailsResponsePostMessage,
  WorkerInfo,
} from '../types';
import { VSCODE_POST_MSG } from '../shared';
import { getWebViewHtml } from './webViewUtils';

/**
 * Create response for login options `postMessage` request from Deephaven iframe.
 * @param id The id of the request.
 * @param credentials The login credentials.
 * @param workerInfo The worker info.
 * @returns The response post message.
 */
export function createLoginOptionsResponsePostMessage({
  id,
  credentials,
  workerInfo,
}: {
  id: string;
  credentials: DhcType.LoginCredentials;
  workerInfo: WorkerInfo;
}): LoginOptionsResponsePostMessage {
  return {
    message: VSCODE_POST_MSG.loginOptionsResponse,
    payload: {
      id,
      payload: credentials,
    },
    targetOrigin: workerInfo.ideUrl,
  };
}

/**
 * Create response for session details `postMessage` request from Deephaven iframe.
 * @param id The id of the request.
 * @param workerInfo The worker info.
 * @returns The response post message.
 */
export function createSessionDetailsResponsePostMessage({
  id,
  workerInfo,
}: {
  id: string;
  workerInfo: WorkerInfo;
}): SessionDetailsResponsePostMessage {
  return {
    message: VSCODE_POST_MSG.sessionDetailsResponse,
    payload: {
      id,
      payload: {
        workerName: workerInfo.workerName,
        processInfoId: workerInfo.processInfoId,
      },
    },
    targetOrigin: workerInfo.ideUrl,
  };
}

/**
 * Get html content to be shown in panel iframe. This html provides a few things:
 * - Styles to make the iframe fill the panel with appropriate padding.
 * - An inner `iframe` that will contain Deephaven content.
 * - A script that manages communication between the DH iframe and the extension
 *  via `postMessage` apis which is necessary for authenticating DHE Core+ workers.
 *
 * The communication flow for DHE Core+ workers is as follows:
 * 1. DH iframe requests login credentials. Script in the panel passes the message along via `vscode.postMessage`.
 * 2. Extension receives the message (PanelController._onPanelMessage) and responds with the credentials via `postResponseMessage`
 *    Script passes message back to DH via `iframeWindow.postMessage`.
 * 3. DH iframe requests session details. Script in the panel passes the message along via `vscode.postMessage`.
 * 4. Extension receives the message (PanelController._onPanelMessage) and responds with the session details via `postResponseMessage`.
 *    Script passes message back to DH via `iframeWindow.postMessage`.
 * @param extensionUri The extension URI.
 * @param webview The webview to generate the html content for.
 * @param iframeUrl The DH URL to load in the iframe.
 * @returns The html content.
 */
export function getPanelHtml(
  extensionUri: vscode.Uri,
  webview: vscode.Webview,
  iframeUrl: URL
): string {
  // NOTE: I kept the cachebusting logic from the previous implementation. But not too sure how vscode webviews handle caching, or if this is necessary.
  const cacheBustedIframeUrl = new URL(iframeUrl);
  cacheBustedIframeUrl.searchParams.set('cachebust', Date.now().toString());

  return getWebViewHtml({
    extensionUri,
    webView: webview,
    viewId: VIEW_ID.variablePanel,
    iframeUrl: cacheBustedIframeUrl,
    scriptFileName: 'main.js',
    stylesFileName: 'styles.css',
  });
}

/**
 * Returns whether a given tab contains a dhPanel.
 * @param tab The tab to check
 * @returns True if the given tab contains a dhPanel.
 */
export function isDhPanelTab(tab?: vscode.Tab): boolean {
  if (tab == null) {
    return false;
  }

  const { input } = tab;

  return (
    input != null &&
    typeof input === 'object' &&
    'viewType' in input &&
    typeof input.viewType === 'string' &&
    input.viewType.endsWith(`-${DH_PANEL_VIEW_TYPE}`)
  );
}
