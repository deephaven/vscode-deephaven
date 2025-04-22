export const DEEPHAVEN_POST_MSG_PREFIX = 'io.deephaven.message.';
export const VSCODE_POST_MSG_PREFIX = 'vscode-ext.';

/** Base postMessage data. */
export interface PostMsgData<TMessage extends string, TPayload = never> {
  id: string;
  message: TMessage;
  payload: TPayload;
  targetOrigin: string;
}
