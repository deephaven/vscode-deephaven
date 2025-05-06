import type {
  BaseThemeKey,
  CreateWorkerIframeSettings,
  SerializableRefreshToken,
} from '../types';
import { VSCODE_POST_MSG_PREFIX, type PostMsgDataVscode } from './commonMsg';

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

export type SetThemeRequestMsgVscode = PostMsgDataVscode<
  typeof VSCODE_POST_MSG.requestSetTheme,
  BaseThemeKey
>;

/**
 * CreateQuery Vscode messages
 */
export type AuthTokenResponseMsg = PostMsgDataVscode<
  typeof VSCODE_POST_MSG.authTokenResponse,
  SerializableRefreshToken
>;
export type SettingsResponseMsgVscode = PostMsgDataVscode<
  typeof VSCODE_POST_MSG.settingsResponse,
  CreateWorkerIframeSettings
>;
export type CreateQueryMsgVscode =
  | AuthTokenResponseMsg
  | SettingsResponseMsgVscode;
