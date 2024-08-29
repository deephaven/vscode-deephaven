import * as vscode from 'vscode';
import { ICON_ID, RUN_SELECTION_COMMAND } from '../common';
import { expandSelectionToFullLines } from '../util';

/**
 * Provides hover content for running selected lines in Deephaven.
 */
export const runSelectedLinesHoverProvider: vscode.HoverProvider = {
  provideHover(_document, position, _token) {
    const editor = vscode.window.activeTextEditor;

    if (editor == null) {
      return;
    }

    // Determine if hover is over a selected line
    const isOverSelection = editor.selections.some(selection =>
      expandSelectionToFullLines(editor.document)(selection).contains(position)
    );

    if (!isOverSelection) {
      return;
    }

    // Tally total selected lines across all selections
    const selectedLineCount = editor.selections.reduce(
      (sum, selection) => sum + 1 + selection.end.line - selection.start.line,
      0
    );

    const hoverContent = new vscode.MarkdownString(
      `[$(${ICON_ID.runSelection}) Run Deephaven selected lines (${selectedLineCount})](command:${RUN_SELECTION_COMMAND})`,
      true
    );

    hoverContent.isTrusted = {
      enabledCommands: [RUN_SELECTION_COMMAND],
    };

    return new vscode.Hover(hoverContent);
  },
};
