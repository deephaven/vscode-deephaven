export const DEEPHAVEN_POST_MSG_PREFIX = 'io.deephaven.message.';
export const VSCODE_POST_MSG_PREFIX = 'vscode-ext.';

/** Base postMessage data. */
export type PostMsgDataDh<TMessage extends string, TPayload = undefined> = {
  id: string;
  message: TMessage;
} & (TPayload extends undefined ? {} : { payload: TPayload });

export type PostMsgDataVscode<TMessage extends string, TPayload = undefined> = {
  id: string;
  message: TMessage;
  targetOrigin: string;
} & (TPayload extends undefined ? {} : { payload: TPayload });
