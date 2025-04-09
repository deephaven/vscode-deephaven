// TODO: Update esbuild to support ESM so we can import this directly
const DEEPHAVEN_POST_MSG = {
  authTokenRequest: 'io.deephaven.message.LoginOptions.authTokenRequest',
  workerCreated: 'io.deephaven.message.LoginOptions.workerCreated',
} as const;

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
