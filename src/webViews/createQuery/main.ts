import {
  type CreateQueryMsg,
  getIframeContentWindow,
  isCreateQueryMsgFromDh,
  isCreateQueryMsgFromVscode,
} from '../../crossModule';
import {} from '../../crossModule/constants';

const vscode = acquireVsCodeApi();

function log(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log('[createQuery main]:', ...args);
}

window.addEventListener(
  'message',
  ({ data, origin, source }: MessageEvent<CreateQueryMsg>) => {
    log('Received message:', JSON.stringify(data), origin, source);

    // Pass the message along to vscode api
    if (isCreateQueryMsgFromDh(data)) {
      log('Sending message to vscode:', data);
      vscode.postMessage({ data, origin });
    } else if (isCreateQueryMsgFromVscode(data)) {
      const msg = { id: data.id, payload: data.payload };

      log('Sending message to Deephaven:', JSON.stringify(msg));
      const iframeWindow = getIframeContentWindow();
      iframeWindow.postMessage(msg, data.targetOrigin);
    }
  }
);
