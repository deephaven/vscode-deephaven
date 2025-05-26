/**
 * Code in this module needs to be consumable from both the extension code (CJS)
 * and the webview content code (ESM). Avoid importing anything here from outside
 * of the `shared` folder to minimize the risk of breaking the builds.
 */

import { type DhCreateQueryMsg, DH_POST_MSG } from './dhPostMsg';
import { type VscodeCreateQueryMsg, VSCODE_POST_MSG } from './vscodePostMsg';

/**
 * Determine if a given message is a `DhCreateQueryMsg`.
 * @param msg The message to check.
 * @returns `true` if the message is a `DhCreateQueryMsg`, `false` otherwise.
 */
export function isCreateQueryMsgFromDh(
  msg: DhCreateQueryMsg | VscodeCreateQueryMsg
): msg is DhCreateQueryMsg {
  return Object.values(DH_POST_MSG).includes(
    msg.message as (typeof DH_POST_MSG)[keyof typeof DH_POST_MSG]
  );
}

/**
 * Determine if a given message is a `VscodeCreateQueryMsg`.
 * @param msg The message to check.
 * @returns `true` if the message is a `VscodeCreateQueryMsg`, `false` otherwise.
 */
export function isCreateQueryMsgFromVscode(
  msg: DhCreateQueryMsg | VscodeCreateQueryMsg
): msg is VscodeCreateQueryMsg {
  return Object.values(VSCODE_POST_MSG).includes(
    msg.message as (typeof VSCODE_POST_MSG)[keyof typeof VSCODE_POST_MSG]
  );
}

/**
 * Check if the source of a message event is a WindowProxy. This is needed
 * since checking `source instanceof Window` doesn't work in the webview context.
 * @param source The source of the message event.
 * @returns True if the source is a WindowProxy, false otherwise.
 */
export function isWindowProxy(
  source?: MessageEventSource | null
): source is WindowProxy {
  return source != null && 'window' in source;
}
