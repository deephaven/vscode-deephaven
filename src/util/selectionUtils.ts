import * as vscode from 'vscode';

/**
 * Combine content of all selected lines (including multi-cursor selections).
 * Any line that is partially selected will be included in its entirety.
 * @param editor
 */
export function getCombinedSelectedLinesText(
  editor: vscode.TextEditor
): string {
  return sortSelections(editor.selections)
    .map(expandSelectionToFullLines(editor.document))
    .map(selection => editor.document.getText(selection))
    .join('\n');
}

/**
 * Create a function that can expand selection to include the full lines of any
 * lines that are included in the selection.
 * @param document
 * @returns
 */
export function expandSelectionToFullLines(document: vscode.TextDocument) {
  /**
   * Expand a given selection to include the full lines of any lines that are included
   * in the selection.
   * @param selection
   */
  return (selection: vscode.Selection): vscode.Selection => {
    return new vscode.Selection(
      selection.start.line,
      0,
      selection.end.line,
      document.lineAt(selection.end.line).text.length
    );
  };
}

/**
 * Sort selections in document order. Useful for converting `TextEditor.selections`
 * which are ordered based on multi-cursor creation order.
 * @param selections
 */
export function sortSelections(
  selections: readonly vscode.Selection[]
): vscode.Selection[] {
  return [...selections].sort(
    (s1, s2) =>
      s1.start.line - s2.start.line || s1.start.character - s2.start.character
  );
}
