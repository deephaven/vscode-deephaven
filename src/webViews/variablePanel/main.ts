import {
  createDhIframe,
  getIframeContentWindow,
  isLoginOptionsRequestFromDh,
  isLoginOptionsResponseFromVscode,
  isSessionDetailsRequestFromDh,
  isSessionDetailsResponseFromVscode,
  Logger,
  type DhVariablePanelMsg,
  type VscodeVariablePanelMsg,
} from '../../shared';

const logger = new Logger('variablePanel/main');

const vscode = acquireVsCodeApi();

window.addEventListener(
  'message',
  ({ data, origin }: MessageEvent<DhVariablePanelMsg | VscodeVariablePanelMsg>) => {
  logger.info('Received message:', JSON.stringify(data), origin);

  // From DH iframe -> VS Code
  if (isLoginOptionsRequestFromDh(data)) {
    logger.info('Received login options request from iframe');
    vscode.postMessage({ data });
    return;
  }

  if (isSessionDetailsRequestFromDh(data)) {
    logger.info('Received session details request from iframe');
    vscode.postMessage({ data });
    return;
  }

  // From VS Code -> DH iframe
  if (isLoginOptionsResponseFromVscode(data)) {
    logger.info('Received login response from ext');
    const iframeWindow = getIframeContentWindow();
    iframeWindow.postMessage(data.payload, data.targetOrigin);
    return;
  }

  if (isSessionDetailsResponseFromVscode(data)) {
    logger.info('Received session details from ext');
    const iframeWindow = getIframeContentWindow();
    iframeWindow.postMessage(data.payload, data.targetOrigin);
    return;
  }
});

createDhIframe(vscode);
