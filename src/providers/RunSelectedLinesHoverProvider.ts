import * as vscode from 'vscode';
import { getRunSelectedLinesMarkdown } from '../util';

/**
 * Provides hover content for running selected lines in Deephaven.
 */
export const runSelectedLinesHoverProvider: vscode.HoverProvider = {
  provideHover(document, position, _token) {
    const hoverMd = getRunSelectedLinesMarkdown(position, document.languageId);
    if (hoverMd == null) {
      return;
    }

    return new vscode.Hover(hoverMd);
  },
};
