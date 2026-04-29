import type { dh as DhcType } from '@deephaven/jsapi-types';
import type {
  BaseThemeKey,
  CreateWorkerIframeSettings,
  SerializableRefreshToken,
} from '../types';
import type { LoggingMessageNotificationParams } from './dhPostMsg';

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
 * JSON-RPC 2.0 method names (forwarded from iframe).
 * These use the standard JSON-RPC format with `method` field.
 */
export const VSCODE_JSON_RPC_METHOD = {
  errorNotification: 'notifications/message',
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

export type VscodeGetPropertyMsg<
  TName extends VscodePropertyName = VscodePropertyName,
> = VscodePostMsgData<typeof VSCODE_POST_MSG.getVscodeProperty, TName>;

export type VscodeGetPropertyResponseMsg<
  TName extends VscodePropertyName = VscodePropertyName,
  TValue = unknown,
> = VscodePostMsgData<
  typeof VSCODE_POST_MSG.getVscodePropertyResponse,
  {
    name: TName;
    value: TValue;
  }
>;

/**
 * Variable panel VS Code messages
 */
export type VscodeLoginOptionsResponseMsg = {
  message: typeof VSCODE_POST_MSG.loginOptionsResponse;
  payload: {
    id: string;
    payload: DhcType.LoginCredentials;
  };
  targetOrigin: string;
};

export type VscodeSessionDetailsResponseMsg = {
  message: typeof VSCODE_POST_MSG.sessionDetailsResponse;
  payload: {
    id: string;
    payload: {
      workerName: string | null;
      processInfoId: string | null;
    };
  };
  targetOrigin: string;
};

/**
 * VS Code forwarded error notification message (JSON-RPC 2.0 format).
 * Follows MCP specification for notifications/message.
 */
export interface VscodeErrorNotificationMsg {
  jsonrpc: '2.0';
  method: typeof VSCODE_JSON_RPC_METHOD.errorNotification;
  params: LoggingMessageNotificationParams;
}

export type VscodeVariablePanelMsg =
  | VscodeLoginOptionsResponseMsg
  | VscodeSessionDetailsResponseMsg
  | VscodeErrorNotificationMsg;
