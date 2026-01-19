import {
  createDhIframe,
  getIframeContentWindow,
  isLoginOptionsRequest,
  isLoginOptionsResponse,
  isSessionDetailsRequest,
  isSessionDetailsResponse,
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
  if (isLoginOptionsRequest(data)) {
    logger.info('Received login options request from iframe');
    vscode.postMessage({ data });
    return;
  }

  if (isSessionDetailsRequest(data)) {
    logger.info('Received session details request from iframe');
    vscode.postMessage({ data });
    return;
  }

  // From VS Code -> DH iframe
  if (isLoginOptionsResponse(data)) {
    logger.info('Received login response from ext');
    const iframeWindow = getIframeContentWindow();
    iframeWindow.postMessage(data.payload, data.targetOrigin);
    return;
  }

  if (isSessionDetailsResponse(data)) {
    logger.info('Received session details from ext');
    const iframeWindow = getIframeContentWindow();
    iframeWindow.postMessage(data.payload, data.targetOrigin);
    return;
  }
});

createDhIframe(vscode);
