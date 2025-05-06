import type {
  CreateWorkerIframeSettings,
  ExternalThemeData,
  QuerySerial,
  SerializableRefreshToken,
} from '../types';

export const DEEPHAVEN_POST_MSG_PREFIX = 'io.deephaven.message.';
export type DhPostMsgType = `${typeof DEEPHAVEN_POST_MSG_PREFIX}${string}`;

/**
 * Deephaven `postMessage` message types.
 */
export const DH_POST_MSG = {
  // Login messages
  loginOptionsRequest: `${DEEPHAVEN_POST_MSG_PREFIX}LoginOptions.request`,
  sessionDetailsRequest: `${DEEPHAVEN_POST_MSG_PREFIX}SessionDetails.request`,
  // Create query messages
  authTokenRequest: `${DEEPHAVEN_POST_MSG_PREFIX}IframeContent.authTokenRequest`,
  settingsChanged: `${DEEPHAVEN_POST_MSG_PREFIX}IframeContent.settingsChanged`,
  settingsRequest: `${DEEPHAVEN_POST_MSG_PREFIX}IframeContent.settingsRequest`,
  workerCreated: `${DEEPHAVEN_POST_MSG_PREFIX}IframeContent.workerCreated`,
  // Theme messages
  requestExternalTheme: `${DEEPHAVEN_POST_MSG_PREFIX}ThemeModel.requestExternalTheme`,
  requestSetTheme: `${DEEPHAVEN_POST_MSG_PREFIX}ThemeModel.requestSetTheme`,
} as const;

/** Base postMessage data for DH messages. */
export type DhPostMsgData<
  TMessage extends DhPostMsgType,
  TPayload = undefined,
> = {
  id: string;
  message: TMessage;
} & (TPayload extends undefined ? { payload?: never } : { payload: TPayload });

/**
 * CreateQuery DH messages
 */
export type DhAuthTokenRequestMsg = DhPostMsgData<
  typeof DH_POST_MSG.authTokenRequest,
  SerializableRefreshToken
>;
export type DhSettingsChangedMsg = DhPostMsgData<
  typeof DH_POST_MSG.settingsChanged,
  CreateWorkerIframeSettings
>;
export type DhSettingsRequestMsg = DhPostMsgData<
  typeof DH_POST_MSG.settingsRequest
>;
export type DhWorkerCreatedMsg = DhPostMsgData<
  typeof DH_POST_MSG.workerCreated,
  QuerySerial
>;
export type DhCreateQueryMsg =
  | DhAuthTokenRequestMsg
  | DhSettingsChangedMsg
  | DhSettingsRequestMsg
  | DhWorkerCreatedMsg;

/**
 * Theme messages
 */
export type DhExternalThemeRequestMsg = DhPostMsgData<
  typeof DH_POST_MSG.requestExternalTheme
>;
export type DhSetThemeRequestMsg = DhPostMsgData<
  typeof DH_POST_MSG.requestSetTheme,
  ExternalThemeData
>;
