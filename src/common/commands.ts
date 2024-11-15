import { EXTENSION_ID } from './constants';

/**
 * Create a command string prefixed with the extension id.
 * @param cmd The command string suffix.
 */
function cmd<T extends string>(cmd: T): `${typeof EXTENSION_ID}.${T}` {
  return `${EXTENSION_ID}.${cmd}`;
}

export const CLEAR_SECRET_STORAGE_CMD = cmd('clearSecretStorage');
export const CONNECT_TO_SERVER_CMD = cmd('connectToServer');
export const CONNECT_TO_SERVER_OPERATE_AS_CMD = cmd('connectToServerOperateAs');
export const CREATE_CORE_AUTHENTICATED_CLIENT_CMD = cmd(
  'createCoreAuthenticatedClient'
);
export const CREATE_DHE_AUTHENTICATED_CLIENT_CMD = cmd(
  'createDHEAuthenticatedClient'
);
export const CREATE_NEW_TEXT_DOC_CMD = cmd('createNewTextDoc');
export const DISCONNECT_EDITOR_CMD = cmd('disconnectEditor');
export const DISCONNECT_FROM_SERVER_CMD = cmd('disconnectFromServer');
export const DOWNLOAD_LOGS_CMD = cmd('downloadLogs');
export const GENERATE_DHE_KEY_PAIR_CMD = cmd('generateDHEKeyPair');
export const OPEN_IN_BROWSER_CMD = cmd('openInBrowser');
export const OPEN_VARIABLE_PANELS_CMD = cmd('openVariablePanels');
export const REFRESH_SERVER_TREE_CMD = cmd('refreshServerTree');
export const REFRESH_SERVER_CONNECTION_TREE_CMD = cmd(
  'refreshServerConnectionTree'
);
export const REFRESH_VARIABLE_PANELS_CMD = cmd('refreshVariablePanels');
export const RUN_CODE_COMMAND = cmd('runCode');
export const RUN_SELECTION_COMMAND = cmd('runSelection');
export const SEARCH_CONNECTIONS_CMD = cmd('searchConnections');
export const SEARCH_PANELS_CMD = cmd('searchPanels');
export const SELECT_CONNECTION_COMMAND = cmd('selectConnection');
export const START_SERVER_CMD = cmd('startServer');
export const STOP_SERVER_CMD = cmd('stopServer');
