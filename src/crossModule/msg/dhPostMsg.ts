import type {
  CreateWorkerIframeSettings,
  ExternalThemeData,
  QuerySerial,
  SerializableRefreshToken,
} from '../types';
import { DEEPHAVEN_POST_MSG_PREFIX, type PostMsgDataDh } from './commonMsg';

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

/**
 * CreateQuery DH messages
 */
export type AuthTokenRequestMsgDh = PostMsgDataDh<
  typeof DH_POST_MSG.authTokenRequest,
  SerializableRefreshToken
>;
export type SettingsChangedMsgDh = PostMsgDataDh<
  typeof DH_POST_MSG.settingsChanged,
  CreateWorkerIframeSettings
>;
export type SettingsRequestMsgDh = PostMsgDataDh<
  typeof DH_POST_MSG.settingsRequest
>;
export type WorkerCreatedMsgDh = PostMsgDataDh<
  typeof DH_POST_MSG.workerCreated,
  QuerySerial
>;
export type CreateQueryMsgDh =
  | AuthTokenRequestMsgDh
  | SettingsChangedMsgDh
  | SettingsRequestMsgDh
  | WorkerCreatedMsgDh;

/**
 * Theme messages
 */
export type ExternalThemeRequestMsgDh = PostMsgDataDh<
  typeof DH_POST_MSG.requestExternalTheme
>;
export type SetThemeRequestMsgDh = PostMsgDataDh<
  typeof DH_POST_MSG.requestSetTheme,
  ExternalThemeData
>;
