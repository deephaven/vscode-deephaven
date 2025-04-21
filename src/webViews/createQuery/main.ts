import { getIframeContentWindow } from '../../crossModule';
import {
  DEEPHAVEN_POST_MSG,
  VSCODE_POST_MSG,
} from '../../crossModule/constants';

const FROM_DEEPHAVEN = new Set([
  DEEPHAVEN_POST_MSG.authTokenRequest,
  DEEPHAVEN_POST_MSG.workerCreated,
]);

const vscode = acquireVsCodeApi();

function log(...args: unknown[]): void {
  console.log('[createQuery main]:', ...args);
}

window.addEventListener('message', ({ data, origin, source }) => {
  log('Received message:', JSON.stringify(data), origin, source);

  // Pass the message along to vscode api
  if (FROM_DEEPHAVEN.has(data.message)) {
    log('Sending message to vscode:', data);
    vscode.postMessage({ data, origin });
  } else if (data.message === VSCODE_POST_MSG.authTokenResponse) {
    const msg = { id: data.id, payload: data.payload };

    log('Sending message to Deephaven:', JSON.stringify(msg));
    const iframeWindow = getIframeContentWindow();
    iframeWindow.postMessage(msg, data.targetOrigin);
  }
});
