/**
 * Code in this module needs to be consumable from both the extension code (CJS)
 * and the webview content code (ESM). Avoid importing anything here from outside
 * of the `crossModule` folder to minimize the risk of breaking the builds.
 */

import { type DhCreateQueryMsg, DH_POST_MSG } from './dhPostMsg';
import { type VscodeCreateQueryMsg, VSCODE_POST_MSG } from './vscodePostMsg';

export function isCreateQueryMsgFromDh(
  msg: DhCreateQueryMsg | VscodeCreateQueryMsg
): msg is DhCreateQueryMsg {
  return Object.values(DH_POST_MSG).includes(
    msg.message as (typeof DH_POST_MSG)[keyof typeof DH_POST_MSG]
  );
}

export function isCreateQueryMsgFromVscode(
  msg: DhCreateQueryMsg | VscodeCreateQueryMsg
): msg is VscodeCreateQueryMsg {
  return Object.values(VSCODE_POST_MSG).includes(
    msg.message as (typeof VSCODE_POST_MSG)[keyof typeof VSCODE_POST_MSG]
  );
}
