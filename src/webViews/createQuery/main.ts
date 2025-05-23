import {
  createDhIframe,
  getIframeContentWindow,
  isCreateQueryMsgFromDh,
  isCreateQueryMsgFromVscode,
  Logger,
  type DhCreateQueryMsg,
  type VscodeCreateQueryMsg,
} from '../../crossModule';

const logger = new Logger('createQuery/main');

const vscode = acquireVsCodeApi();

window.addEventListener(
  'message',
  ({
    data,
    origin,
    source,
  }: MessageEvent<DhCreateQueryMsg | VscodeCreateQueryMsg>) => {
    logger.info('Received message:', JSON.stringify(data), origin, source);

    // From DH -> VS Code
    if (isCreateQueryMsgFromDh(data)) {
      logger.info('Sending message to vscode:', data);
      vscode.postMessage({ data, origin });
      return;
    }

    // From VS Code -> DH
    if (isCreateQueryMsgFromVscode(data)) {
      const { id, payload, targetOrigin } = data;
      const msg = { id, payload };

      logger.info('Sending message to Deephaven:', JSON.stringify(msg));
      const iframeWindow = getIframeContentWindow();
      iframeWindow.postMessage(msg, targetOrigin);
      return;
    }
  }
);

createDhIframe(vscode);
