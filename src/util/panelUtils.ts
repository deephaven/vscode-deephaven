import type { dh as DhcType } from '@deephaven/jsapi-types';
import { DEEPHAVEN_POST_MSG, VSCODE_POST_MSG } from '../common';
import type {
  LoginOptionsResponsePostMessage,
  SessionDetailsResponsePostMessage,
  WorkerInfo,
} from '../types';

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
 * @param iframeUrl The DH URL to load in the iframe.
 * @param title The title of the panel.
 * @returns The html content.
 */
export function getPanelHtml(iframeUrl: URL, title: string): string {
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Deephaven</title>
      <style>
      html {
        height: 100%;
        overflow: hidden;
      }
      body {
        --vscode-dh-panel-padding-top: 20px;
        padding-top: var(--vscode-dh-panel-padding-top);
        height: calc(100vh - var(--vscode-dh-panel-padding-top));
        overflow: hidden;
      }
      iframe {
        border: none;
        width: 100%;
        height: 100%;
      }
      </style>
  </head>
  <body>
      <script>
      (function() {
        const vscode = acquireVsCodeApi();

        window.addEventListener('message', ({ data }) => {
          if (data.message === '${DEEPHAVEN_POST_MSG.loginOptionsRequest}') {
            console.log('LoginOptions request received from iframe');
            vscode.postMessage({ data });
            return;
          }

          if (data.message === '${DEEPHAVEN_POST_MSG.sessionDetailsRequest}') {
            console.log('SessionDetails request received from iframe');
            vscode.postMessage({ data });
            return;
          }

          if (data.message === '${VSCODE_POST_MSG.loginOptionsResponse}') {
            console.log('Received login message from ext');
            const iframeWindow = document.getElementById('content-iframe').contentWindow;
            iframeWindow.postMessage(data.payload, data.targetOrigin);
            return;
          }

          if (data.message === '${VSCODE_POST_MSG.sessionDetailsResponse}') {
            console.log('Received session message from ext');
            const iframeWindow = document.getElementById('content-iframe').contentWindow;
            iframeWindow.postMessage(data.payload, data.targetOrigin);
            return;
          }

          console.log('Unknown message type');
        });
      }())
      </script>
      <iframe id="content-iframe" src="${iframeUrl}&cachebust=${new Date().getTime()}" title="${title}"></iframe>
  </body>
  </html>`;
}
