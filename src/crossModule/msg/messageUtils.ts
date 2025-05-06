import { type CreateQueryMsgDh, DH_POST_MSG } from './dhPostMsg';
import { type CreateQueryMsgVscode, VSCODE_POST_MSG } from './vscodePostMsg';

export function isCreateQueryMsgFromDh(
  msg: CreateQueryMsgDh | CreateQueryMsgVscode
): msg is CreateQueryMsgDh {
  return Object.values(DH_POST_MSG).includes(
    msg.message as (typeof DH_POST_MSG)[keyof typeof DH_POST_MSG]
  );
}

export function isCreateQueryMsgFromVscode(
  msg: CreateQueryMsgDh | CreateQueryMsgVscode
): msg is CreateQueryMsgVscode {
  return Object.values(VSCODE_POST_MSG).includes(
    msg.message as (typeof VSCODE_POST_MSG)[keyof typeof VSCODE_POST_MSG]
  );
}
