import type { BaseThemeKey, ThemeCssColorVariableName } from '../types';
import {
  DEEPHAVEN_POST_MSG_PREFIX,
  VSCODE_POST_MSG_PREFIX,
  type PostMsgDataDh,
  type PostMsgDataVscode,
} from './commonMsg';

export const THEME_POST_MSG_DH = {
  requestExternalTheme: `${DEEPHAVEN_POST_MSG_PREFIX}ThemeModel.requestExternalTheme`,
  requestSetTheme: `${DEEPHAVEN_POST_MSG_PREFIX}ThemeModel.requestSetTheme`,
} as const;

export const THEME_POST_MSG_VSCODE = {
  requestSetTheme: `${VSCODE_POST_MSG_PREFIX}requestSetTheme`,
} as const;

export interface ExternalThemeData {
  baseThemeKey?: BaseThemeKey;
  name: string;
  cssVars: Record<ThemeCssColorVariableName, string>;
}

export type ExternalThemeRequestMsgDh = PostMsgDataDh<
  typeof THEME_POST_MSG_DH.requestExternalTheme
>;

export type SetThemeRequestMsgDh = PostMsgDataDh<
  typeof THEME_POST_MSG_DH.requestSetTheme,
  ExternalThemeData
>;

export type SetThemeRequestMsgVscode = PostMsgDataVscode<
  typeof THEME_POST_MSG_VSCODE.requestSetTheme,
  BaseThemeKey
>;

export type ThemeMsg = ExternalThemeRequestMsgDh | SetThemeRequestMsgVscode;
