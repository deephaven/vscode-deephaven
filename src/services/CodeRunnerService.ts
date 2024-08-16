import * as vscode from 'vscode';
import type { ICodeRunnerService, IDhService, IServerManager } from './types';
import { ConsoleType } from '../common';
import { Logger } from '../util';

const logger = new Logger('CodeRunnerService');

export class CodeRunnerService implements ICodeRunnerService {
  constructor(serverManager: IServerManager) {
    this._serverManager = serverManager;
    this._editorConnections = new Map();
  }

  private _serverManager: IServerManager;
  private _editorConnections: Map<string, IDhService>;

  runCode = async (
    editor: vscode.TextEditor,
    selectionOnly?: boolean
  ): Promise<void> => {
    const uriStr = editor.document.uri.toString();

    // Remove the connection if it's no longer connected
    if (this._editorConnections.get(uriStr)?.isConnected === false) {
      this._editorConnections.delete(uriStr);
    }

    if (!this._editorConnections.has(uriStr)) {
      // Default to first connection supporting the console type
      const [dhService] = await this._serverManager.consoleTypeConnections(
        editor.document.languageId as ConsoleType
      );

      if (dhService != null) {
        this._editorConnections.set(uriStr, dhService);
      }
    }

    const dhService = this._editorConnections.get(uriStr);

    if (dhService == null) {
      logger.debug(
        `No active connection found supporting '${editor.document.languageId}' console type.`
      );
      return;
    }

    await dhService.runEditorCode(editor, selectionOnly);
  };

  dispose = async (): Promise<void> => {
    this._editorConnections.clear();
  };
}
