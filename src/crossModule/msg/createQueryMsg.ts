import type { Brand, SerializableRefreshToken } from '../types';
import {
  DEEPHAVEN_POST_MSG_PREFIX,
  VSCODE_POST_MSG_PREFIX,
  type PostMsgData,
} from './commonMsg';

/** Create query messages */
export const CREATE_QUERY_POST_MSG_DH = {
  authTokenRequest: `${DEEPHAVEN_POST_MSG_PREFIX}IframeContent.authTokenRequest`,
  settingsChanged: `${DEEPHAVEN_POST_MSG_PREFIX}IframeContent.settingsChanged`,
  settingsRequest: `${DEEPHAVEN_POST_MSG_PREFIX}IframeContent.settingsRequest`,
  workerCreated: `${DEEPHAVEN_POST_MSG_PREFIX}IframeContent.workerCreated`,
} as const;

export const CREATE_QUERY_POST_MSG_VSCODE = {
  authTokenResponse: `${VSCODE_POST_MSG_PREFIX}authTokenResponse`,
  settingsResponse: `${VSCODE_POST_MSG_PREFIX}settingsResponse`,
} as const;

/**
 * This is an opaque type representing `ConsoleSettings` defined in DHE web. The
 * extension doesn't care about the details since it persists it as-is to
 * remember user worker creation preferences.
 */
export type ConsoleSettings = Brand<'ConsoleSettings', Record<string, unknown>>;

/**
 * Copy of `CreateWorkerIframeSettings` in DHE web.
 */
interface CreateWorkerIframeSettings {
  newWorkerName: string;
  settings: Partial<ConsoleSettings>;
  showHeader?: boolean;
}

/**
 * CreateQuery DH messages
 */
type AuthTokenRequestMsg = PostMsgData<
  typeof CREATE_QUERY_POST_MSG_DH.authTokenRequest,
  SerializableRefreshToken
>;
type SettingsChangedMsg = PostMsgData<
  typeof CREATE_QUERY_POST_MSG_DH.settingsChanged,
  CreateWorkerIframeSettings
>;
type SettingsRequestMsg = PostMsgData<
  typeof CREATE_QUERY_POST_MSG_DH.settingsRequest
>;
type WorkerCreatedMsg = PostMsgData<
  typeof CREATE_QUERY_POST_MSG_DH.workerCreated
>;
export type CreateQueryMsgDh =
  | AuthTokenRequestMsg
  | SettingsChangedMsg
  | SettingsRequestMsg
  | WorkerCreatedMsg;

/**
 * CreateQuery Vscode messages
 */
export type AuthTokenResponseMsg = PostMsgData<
  typeof CREATE_QUERY_POST_MSG_VSCODE.authTokenResponse,
  SerializableRefreshToken
>;
export type SettingsResponseMsgVscode = PostMsgData<
  typeof CREATE_QUERY_POST_MSG_VSCODE.settingsResponse,
  CreateWorkerIframeSettings
>;
type CreateQueryMsgVscode = AuthTokenResponseMsg | SettingsResponseMsgVscode;

export type CreateQueryMsg = CreateQueryMsgDh | CreateQueryMsgVscode;

export function isCreateQueryMsgFromDh(
  msg: CreateQueryMsgDh | CreateQueryMsgVscode
): msg is CreateQueryMsgDh {
  return Object.values(CREATE_QUERY_POST_MSG_DH).includes(
    msg.message as (typeof CREATE_QUERY_POST_MSG_DH)[keyof typeof CREATE_QUERY_POST_MSG_DH]
  );
}

export function isCreateQueryMsgFromVscode(
  msg: CreateQueryMsgDh | CreateQueryMsgVscode
): msg is CreateQueryMsgVscode {
  return Object.values(CREATE_QUERY_POST_MSG_VSCODE).includes(
    msg.message as (typeof CREATE_QUERY_POST_MSG_VSCODE)[keyof typeof CREATE_QUERY_POST_MSG_VSCODE]
  );
}
