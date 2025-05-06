import type { BaseThemeKey } from '../types';
import { VSCODE_POST_MSG_PREFIX, type PostMsgDataVscode } from './commonMsg';

/**
 * VS Code `postMessage` message types.
 */
export const VSCODE_POST_MSG = {
  requestSetTheme: `${VSCODE_POST_MSG_PREFIX}requestSetTheme`,
} as const;

export type SetThemeRequestMsgVscode = PostMsgDataVscode<
  typeof VSCODE_POST_MSG.requestSetTheme,
  BaseThemeKey
>;
