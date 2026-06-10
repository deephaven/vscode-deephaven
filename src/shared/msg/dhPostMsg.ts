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
  workerCreationCancelled: `${DEEPHAVEN_POST_MSG_PREFIX}IframeContent.workerCreationCancelled`,
  // Theme messages
  requestExternalTheme: `${DEEPHAVEN_POST_MSG_PREFIX}ThemeModel.requestExternalTheme`,
  requestSetTheme: `${DEEPHAVEN_POST_MSG_PREFIX}ThemeModel.requestSetTheme`,
} as const;

/**
 * JSON-RPC 2.0 method names for MCP Apps compatibility.
 * These use the standard JSON-RPC format with `method` field, not the legacy `message` field.
 */
export const DH_JSON_RPC_METHOD = {
  errorNotification: 'notifications/message',
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
export type DhWorkerCreationCancelledMsg = DhPostMsgData<
  typeof DH_POST_MSG.workerCreationCancelled
>;
export type DhCreateQueryMsg =
  | DhAuthTokenRequestMsg
  | DhSettingsChangedMsg
  | DhSettingsRequestMsg
  | DhWorkerCreatedMsg
  | DhWorkerCreationCancelledMsg;

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

/**
 * Variable panel Deephaven messages
 */
export type DhLoginOptionsRequestMsg = DhPostMsgData<
  typeof DH_POST_MSG.loginOptionsRequest
>;
export type DhSessionDetailsRequestMsg = DhPostMsgData<
  typeof DH_POST_MSG.sessionDetailsRequest
>;

/**
 * MCP logging levels as defined in the specification.
 * Maps to syslog message severities (RFC-5424).
 */
export type LoggingLevel =
  | 'debug'
  | 'info'
  | 'notice'
  | 'warning'
  | 'error'
  | 'critical'
  | 'alert'
  | 'emergency';

/**
 * Logging message notification params as defined in MCP spec.
 * The `data` field can be any JSON-serializable value.
 */
export interface LoggingMessageNotificationParams {
  /** The severity of this log message */
  level: LoggingLevel;
  /** An optional name of the logger issuing this message */
  logger?: string;
  /** The data to be logged - any JSON serializable type */
  data: unknown;
}

/**
 * Deephaven error notification message (JSON-RPC 2.0 format).
 * Follows MCP specification for notifications/message.
 */
export interface DhErrorNotificationMsg {
  jsonrpc: '2.0';
  method: typeof DH_JSON_RPC_METHOD.errorNotification;
  params: LoggingMessageNotificationParams;
}

export type DhVariablePanelMsg =
  | DhLoginOptionsRequestMsg
  | DhSessionDetailsRequestMsg
  | DhErrorNotificationMsg;
