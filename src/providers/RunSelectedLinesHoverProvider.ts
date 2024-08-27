import * as vscode from 'vscode';
import { ICON_ID, RUN_SELECTION_COMMAND } from '../common';

/**
 * Provides hover content for running selected lines in Deephaven.
 */
export const runSelectedLinesHoverProvider: vscode.HoverProvider = {
  provideHover(_document, _position, _token) {
    const hoverContent = new vscode.MarkdownString(
      `[$(${ICON_ID.runSelection}) Run Deephaven selected lines](command:${RUN_SELECTION_COMMAND})`,
      true
    );

    hoverContent.isTrusted = {
      enabledCommands: [RUN_SELECTION_COMMAND],
    };

    const editor = vscode.window.activeTextEditor;
    if (editor == null) {
      return;
    }

    return new vscode.Hover(hoverContent);
  },
};
