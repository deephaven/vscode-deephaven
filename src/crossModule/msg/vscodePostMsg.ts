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
  // VS Code property messages
  getVscodeProperty: `${VSCODE_POST_MSG_PREFIX}getVscodeProperty`,
  getVscodePropertyResponse: `${VSCODE_POST_MSG_PREFIX}getVscodePropertyResponse`,
} as const;

/**
 * VS Code postMessage data.
 */
export type VscodePostMsgData<
  TMessage extends VscodePostMsgType,
  TPayload = undefined,
> = {
  id: string;
  message: TMessage;
} & (TPayload extends undefined ? { payload?: never } : { payload: TPayload });

/**
 * VS Code postMessage data with target origin.
 */
export type VscodePostMsgDataTargetOrigin<
  TMessage extends VscodePostMsgType,
  TPayload = undefined,
> = VscodePostMsgData<TMessage, TPayload> & {
  targetOrigin: string;
};

/**
 * Theme messages
 */
export type VscodeSetThemeRequestMsg = VscodePostMsgDataTargetOrigin<
  typeof VSCODE_POST_MSG.requestSetTheme,
  BaseThemeKey
>;

/**
 * CreateQuery Vscode messages
 */
export type VscodeAuthTokenResponseMsg = VscodePostMsgDataTargetOrigin<
  typeof VSCODE_POST_MSG.authTokenResponse,
  SerializableRefreshToken
>;
export type VscodeSettingsResponseMsg = VscodePostMsgDataTargetOrigin<
  typeof VSCODE_POST_MSG.settingsResponse,
  CreateWorkerIframeSettings
>;
export type VscodeCreateQueryMsg =
  | VscodeAuthTokenResponseMsg
  | VscodeSettingsResponseMsg;

/**
 * Get VS Code property messages
 */
export type VscodePropertyName = 'baseThemeKey';

export type VscodeGetPropertyMsg = VscodePostMsgData<
  typeof VSCODE_POST_MSG.getVscodeProperty,
  VscodePropertyName
>;
export type VscodeGetPropertyResponseMsg = VscodePostMsgData<
  typeof VSCODE_POST_MSG.getVscodePropertyResponse,
  {
    name: VscodePropertyName;
    value: unknown;
  }
>;
