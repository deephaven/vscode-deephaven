import type {
  BaseThemeKey,
  CreateWorkerIframeSettings,
  SerializableRefreshToken,
} from '../types';

export const VSCODE_POST_MSG_PREFIX = 'vscode-ext.';
export type VscodePostMsgType = `${typeof VSCODE_POST_MSG_PREFIX}${string}`;

/**
 * VS Code `postMessage` message types.
 */
export const VSCODE_POST_MSG = {
  // Login messages
  loginOptionsResponse: `${VSCODE_POST_MSG_PREFIX}loginOptions`,
  sessionDetailsResponse: `${VSCODE_POST_MSG_PREFIX}sessionDetails`,
  // Create query messages
  authTokenResponse: `${VSCODE_POST_MSG_PREFIX}authTokenResponse`,
  settingsResponse: `${VSCODE_POST_MSG_PREFIX}settingsResponse`,
  // Theme messages
  requestSetTheme: `${VSCODE_POST_MSG_PREFIX}requestSetTheme`,
} as const;

export type VscodePostMsgData<
  TMessage extends VscodePostMsgType,
  TPayload = undefined,
> = {
  id: string;
  message: TMessage;
  targetOrigin: string;
} & (TPayload extends undefined ? {} : { payload: TPayload });

export type VscodeSetThemeRequestMsg = VscodePostMsgData<
  typeof VSCODE_POST_MSG.requestSetTheme,
  BaseThemeKey
>;

/**
 * CreateQuery Vscode messages
 */
export type VscodeAuthTokenResponseMsg = VscodePostMsgData<
  typeof VSCODE_POST_MSG.authTokenResponse,
  SerializableRefreshToken
>;
export type VscodeSettingsResponseMsg = VscodePostMsgData<
  typeof VSCODE_POST_MSG.settingsResponse,
  CreateWorkerIframeSettings
>;
export type VscodeCreateQueryMsg =
  | VscodeAuthTokenResponseMsg
  | VscodeSettingsResponseMsg;
