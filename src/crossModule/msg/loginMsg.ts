import { DEEPHAVEN_POST_MSG_PREFIX, VSCODE_POST_MSG_PREFIX } from './commonMsg';

/** Login messages */
export const LOGIN_POST_MSG_DH = {
  loginOptionsRequest: `${DEEPHAVEN_POST_MSG_PREFIX}LoginOptions.request`,
  sessionDetailsRequest: `${DEEPHAVEN_POST_MSG_PREFIX}SessionDetails.request`,
} as const;

export const LOGIN_POST_MSG_VSCODE = {
  loginOptionsResponse: `${VSCODE_POST_MSG_PREFIX}loginOptions`,
  sessionDetailsResponse: `${VSCODE_POST_MSG_PREFIX}sessionDetails`,
} as const;
