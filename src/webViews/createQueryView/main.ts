import { DEEPHAVEN_POST_MSG } from '../../common/postMsgConstants';

const FROM_DEEPHAVEN = new Set([
  DEEPHAVEN_POST_MSG.authTokenRequest,
  DEEPHAVEN_POST_MSG.workerCreated,
]);

const vscode = acquireVsCodeApi();

window.addEventListener('message', ({ data, origin }) => {
  // Pass the message along to vscode api
  if (FROM_DEEPHAVEN.has(data.message)) {
    vscode.postMessage({ data, origin });
  }
});
