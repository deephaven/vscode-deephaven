/**
 * Constants that need to be consumable from both the extension code (CJS) and
 * the webview content code (ESM). Avoid importing anything from other files
 * to minimize the risk of breaking the builds.
 */

export const CONTENT_IFRAME_ID = 'content-iframe';

export const DEEPHAVEN_POST_MSG = {
  authTokenRequest: 'io.deephaven.message.LoginOptions.authTokenRequest',
  loginOptionsRequest: 'io.deephaven.message.LoginOptions.request',
  sessionDetailsRequest: 'io.deephaven.message.SessionDetails.request',
  workerCreated: 'io.deephaven.message.LoginOptions.workerCreated',
} as const;

export const VSCODE_POST_MSG = {
  authTokenResponse: 'vscode-ext.authToken',
  loginOptionsResponse: 'vscode-ext.loginOptions',
  sessionDetailsResponse: 'vscode-ext.sessionDetails',
} as const;
