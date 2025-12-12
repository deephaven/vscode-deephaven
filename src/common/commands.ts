import type * as vscode from 'vscode';
import { EXTENSION_ID } from './constants';
import type { SerializedRange } from '../types';

/** Arguments passed to `RUN_CODE_COMMAND` handler */
export type RunCodeCmdArgs = [
  uri?: vscode.Uri,
  _arg?: { groupId: number },
  constrainTo?: 'selection' | vscode.Range[],
  languageId?: string,
];

/** Arguments passed to `RUN_MARKDOWN_CODEBLOCK_CMD` handler */
export type RunMarkdownCodeblockCmdArgs = [
  uri: vscode.Uri,
  languageId: string,
  range: vscode.Range | SerializedRange,
];

/** Arguments passed to `RUN_SELECTION_COMMAND` handler */
export type RunSelectionCmdArgs = [
  uri?: vscode.Uri,
  _arg?: { groupId: number },
  languageId?: string,
];

/**
 * Create a command string prefixed with the extension id.
 * @param cmd The command string suffix.
 */
function cmd<T extends string>(cmd: T): `${typeof EXTENSION_ID}.${T}` {
  return `${EXTENSION_ID}.${cmd}`;
}

export const CLEAR_SECRET_STORAGE_CMD = cmd('clearSecretStorage');
export const CLOSE_CREATE_QUERY_VIEW_CMD = cmd('view.createQuery.close');
export const CONNECT_TO_SERVER_CMD = cmd('connectToServer');
export const CONNECT_TO_SERVER_OPERATE_AS_CMD = cmd('connectToServerOperateAs');
export const CREATE_CORE_AUTHENTICATED_CLIENT_CMD = cmd(
  'createCoreAuthenticatedClient'
);
export const CREATE_DHE_AUTHENTICATED_CLIENT_CMD = cmd(
  'createDHEAuthenticatedClient'
);
export const CREATE_NEW_TEXT_DOC_CMD = cmd('createNewTextDoc');
export const DELETE_VARIABLE_CMD = cmd('deleteVariable');
export const DISCONNECT_EDITOR_CMD = cmd('disconnectEditor');
export const DISCONNECT_FROM_SERVER_CMD = cmd('disconnectFromServer');
export const DOWNLOAD_LOGS_CMD = cmd('downloadLogs');
export const GENERATE_DHE_KEY_PAIR_CMD = cmd('generateDHEKeyPair');
export const GENERATE_REQUIREMENTS_TXT_CMD = cmd('generateRequirementsTxt');
export const OPEN_IN_BROWSER_CMD = cmd('openInBrowser');
export const OPEN_VARIABLE_PANELS_CMD = cmd('openVariablePanels');
export const REFRESH_REMOTE_IMPORT_SOURCE_TREE_CMD = cmd(
  'refreshRemoteImportSourceTree'
);
export const REFRESH_SERVER_TREE_CMD = cmd('refreshServerTree');
export const REFRESH_SERVER_CONNECTION_TREE_CMD = cmd(
  'refreshServerConnectionTree'
);
export const REFRESH_PANELS_TREE_CMD = cmd('refreshPanelsTree');
export const REFRESH_VARIABLE_PANELS_CMD = cmd('refreshVariablePanels');
export const RUN_CODE_COMMAND = cmd('runCode');
export const RUN_MARKDOWN_CODEBLOCK_CMD = cmd('runMarkdownCodeBlock');
export const RUN_SELECTION_COMMAND = cmd('runSelection');
export const SEARCH_CONNECTIONS_CMD = cmd('searchConnections');
export const SEARCH_PANELS_CMD = cmd('searchPanels');
export const SELECT_CONNECTION_COMMAND = cmd('selectConnection');
export const START_SERVER_CMD = cmd('startServer');
export const STOP_SERVER_CMD = cmd('stopServer');
export const ADD_REMOTE_FILE_SOURCE_CMD = cmd('addRemoteFileSource');
export const REMOVE_REMOTE_FILE_SOURCE_CMD = cmd('removeRemoteFileSource');
export const COPY_MCP_URL_CMD = cmd('copyMcpUrl');
