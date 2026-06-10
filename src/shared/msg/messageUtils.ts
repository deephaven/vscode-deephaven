import {
  type DhCreateQueryMsg,
  type DhErrorNotificationMsg,
  type DhLoginOptionsRequestMsg,
  type DhSessionDetailsRequestMsg,
  type DhVariablePanelMsg,
  DH_JSON_RPC_METHOD,
  DH_POST_MSG,
} from './dhPostMsg';
import {
  type VscodeCreateQueryMsg,
  type VscodeErrorNotificationMsg,
  type VscodeLoginOptionsResponseMsg,
  type VscodeSessionDetailsResponseMsg,
  type VscodeVariablePanelMsg,
  VSCODE_JSON_RPC_METHOD,
  VSCODE_POST_MSG,
} from './vscodePostMsg';

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

/**
 * Determine if a given message is a `DhLoginOptionsRequestMsg`.
 * @param msg The message to check.
 * @returns `true` if the message is a `DhLoginOptionsRequestMsg`, `false` otherwise.
 */
export function isLoginOptionsRequestFromDh(
  msg: DhVariablePanelMsg | VscodeVariablePanelMsg
): msg is DhLoginOptionsRequestMsg {
  return 'message' in msg && msg.message === DH_POST_MSG.loginOptionsRequest;
}

/**
 * Determine if a given message is a `DhSessionDetailsRequestMsg`.
 * @param msg The message to check.
 * @returns `true` if the message is a `DhSessionDetailsRequestMsg`, `false` otherwise.
 */
export function isSessionDetailsRequestFromDh(
  msg: DhVariablePanelMsg | VscodeVariablePanelMsg
): msg is DhSessionDetailsRequestMsg {
  return 'message' in msg && msg.message === DH_POST_MSG.sessionDetailsRequest;
}

/**
 * Determine if a given message is a `DhErrorNotificationMsg` (JSON-RPC 2.0 format).
 * @param msg The message to check.
 * @returns `true` if the message is a `DhErrorNotificationMsg`, `false` otherwise.
 */
export function isErrorNotificationFromDh(
  msg: DhVariablePanelMsg | VscodeVariablePanelMsg
): msg is DhErrorNotificationMsg {
  return (
    'jsonrpc' in msg &&
    msg.jsonrpc === '2.0' &&
    'method' in msg &&
    msg.method === DH_JSON_RPC_METHOD.errorNotification
  );
}

/**
 * Determine if a given message is a `VscodeLoginOptionsResponseMsg`.
 * @param msg The message to check.
 * @returns `true` if the message is a `VscodeLoginOptionsResponseMsg`, `false` otherwise.
 */
export function isLoginOptionsResponseFromVscode(
  msg: DhVariablePanelMsg | VscodeVariablePanelMsg
): msg is VscodeLoginOptionsResponseMsg {
  return (
    'message' in msg && msg.message === VSCODE_POST_MSG.loginOptionsResponse
  );
}

/**
 * Determine if a given message is a `VscodeSessionDetailsResponseMsg`.
 * @param msg The message to check.
 * @returns `true` if the message is a `VscodeSessionDetailsResponseMsg`, `false` otherwise.
 */
export function isSessionDetailsResponseFromVscode(
  msg: DhVariablePanelMsg | VscodeVariablePanelMsg
): msg is VscodeSessionDetailsResponseMsg {
  return (
    'message' in msg && msg.message === VSCODE_POST_MSG.sessionDetailsResponse
  );
}

/**
 * Determine if a given message is a `VscodeErrorNotificationMsg` (JSON-RPC 2.0 format).
 * @param msg The message to check.
 * @returns `true` if the message is a `VscodeErrorNotificationMsg`, `false` otherwise.
 */
export function isErrorNotificationFromVscode(
  msg: DhVariablePanelMsg | VscodeVariablePanelMsg
): msg is VscodeErrorNotificationMsg {
  return (
    'jsonrpc' in msg &&
    msg.jsonrpc === '2.0' &&
    'method' in msg &&
    msg.method === VSCODE_JSON_RPC_METHOD.errorNotification
  );
}
