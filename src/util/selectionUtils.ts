import * as vscode from 'vscode';

/**
 * Combine content of all range lines. Any partial lines will be expanded to
 * include the full line content.
 * @param document The document to extract the range lines from.
 * @param ranges The ranges to extract the lines from.
 */
export function getCombinedRangeLinesText(
  document: vscode.TextDocument,
  ranges: readonly vscode.Range[]
): string {
  return sortRanges(ranges)
    .map(expandRangeToFullLines(document))
    .map(range => document.getText(range))
    .join('\n');
}

/**
 * Create a function that can expand range to include the full lines of any
 * lines that are included in the range.
 * @param document
 * @returns
 */
export function expandRangeToFullLines(document: vscode.TextDocument) {
  /**
   * Expand a given selection to include the full lines of any lines that are included
   * in the selection.
   * @param selection
   */
  return (range: vscode.Range): vscode.Range => {
    return new vscode.Range(
      range.start.line,
      0,
      range.end.line,
      document.lineAt(range.end.line).text.length
    );
  };
}

/**
 * Sort ranges in document order. Useful for converting `TextEditor.selections`
 * which are ordered based on multi-cursor creation order.
 * @param ranges
 */
export function sortRanges<TRange extends vscode.Range>(
  ranges: readonly TRange[]
): TRange[] {
  return [...ranges].sort(
    (s1, s2) =>
      s1.start.line - s2.start.line || s1.start.character - s2.start.character
  );
}
