/**
 * Constants used for `postMessage` interaction.
 * Note that these need to be consumable from both the extension code (CJS) and
 * the webview content code (ESM), so avoid importing anything from other files
 * to minimize the risk of breaking the builds.
 */

export const DEEPHAVEN_POST_MSG = {
  authTokenRequest: 'io.deephaven.message.LoginOptions.authTokenRequest',
  loginOptionsRequest: 'io.deephaven.message.LoginOptions.request',
  sessionDetailsRequest: 'io.deephaven.message.SessionDetails.request',
  workerCreated: 'io.deephaven.message.LoginOptions.workerCreated',
} as const;

export const VSCODE_POST_MSG = {
  loginOptionsResponse: 'vscode-ext.loginOptions',
  sessionDetailsResponse: 'vscode-ext.sessionDetails',
} as const;
