import {
  createDhIframe,
  getIframeContentWindow,
  isLoginOptionsRequest,
  isLoginOptionsResponse,
  isSessionDetailsRequest,
  isSessionDetailsResponse,
  isSetThemeRequest,
  Logger,
  DH_POST_MSG,
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
    logger.info('Received login options request');
    vscode.postMessage({ data });
    return;
  }

  if (isSessionDetailsRequest(data)) {
    logger.info('Received session details request');
    vscode.postMessage({ data });
    return;
  }

  // From VS Code -> DH iframe
  if (isLoginOptionsResponse(data)) {
    logger.info('Received login response');
    const iframeWindow = getIframeContentWindow();
    iframeWindow.postMessage(data.payload, data.targetOrigin);
    return;
  }

  if (isSessionDetailsResponse(data)) {
    logger.info('Received session details');
    const iframeWindow = getIframeContentWindow();
    iframeWindow.postMessage(data.payload, data.targetOrigin);
    return;
  }

  if (isSetThemeRequest(data)) {
    logger.info('Received set theme request');
    const iframeWindow = getIframeContentWindow();
    const { id, payload, targetOrigin } = data;
    iframeWindow.postMessage(
      {
        id,
        message: DH_POST_MSG.requestSetTheme,
        payload,
      },
      targetOrigin
    );
    return;
  }
});

createDhIframe(vscode);
