export const DEEPHAVEN_POST_MSG_PREFIX = 'io.deephaven.message.';
export const VSCODE_POST_MSG_PREFIX = 'vscode-ext.';

/** Base postMessage data. */
export interface PostMsgData<TMessage extends string, TPayload = never> {
  id: string;
  message: TMessage;
  payload: TPayload;
  targetOrigin: string;
}

export const MSG_DH = {
  externalThemeRequest: `${DEEPHAVEN_POST_MSG_PREFIX}ThemeModel.requestExternalTheme`,
};

export const MSG_VSCODE = {
  externalThemeResponse: `${VSCODE_POST_MSG_PREFIX}ExternalTheme.response`,
};
