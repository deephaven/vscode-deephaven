import type { ExternalThemeData } from '../types';
import { DEEPHAVEN_POST_MSG_PREFIX, type PostMsgDataDh } from './commonMsg';

/**
 * Deephaven `postMessage` message types.
 */
export const DH_POST_MSG = {
  // Theme messages
  requestExternalTheme: `${DEEPHAVEN_POST_MSG_PREFIX}ThemeModel.requestExternalTheme`,
  requestSetTheme: `${DEEPHAVEN_POST_MSG_PREFIX}ThemeModel.requestSetTheme`,
} as const;

export type ExternalThemeRequestMsgDh = PostMsgDataDh<
  typeof DH_POST_MSG.requestExternalTheme
>;

export type SetThemeRequestMsgDh = PostMsgDataDh<
  typeof DH_POST_MSG.requestSetTheme,
  ExternalThemeData
>;
