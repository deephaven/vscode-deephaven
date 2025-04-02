import * as vscode from 'vscode';
import { ParsedDocumentCache } from '../services';
import {
  getRunMarkdownCodeBlockMarkdown,
  getRunSelectedLinesMarkdown,
} from '../util';
import type { CodeBlock } from '../types';

/**
 * Hover provider that provides a button to run a Deephaven code block in a Markdown file.
 */
export class RunMarkdownCodeBlockHoverProvider implements vscode.HoverProvider {
  constructor(codeBlockCache: ParsedDocumentCache<CodeBlock[]>) {
    this._codeBlockCache = codeBlockCache;
  }

  private readonly _codeBlockCache: ParsedDocumentCache<CodeBlock[]>;

  /**
   * Provide a hover for the given position and document.
   *
   * @param document The document in which the command was invoked.
   * @param position The position at which the command was invoked.
   * @param token A cancellation token.
   * @returns A hover or a thenable that resolves to such. The lack of a result can be
   * signaled by returning `undefined` or `null`.
   */
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    const codeBlocks = this._codeBlockCache.get(document);

    for (const codeBlock of codeBlocks) {
      const { languageId, range } = codeBlock;

      if (range.contains(position)) {
        const hoverContents: vscode.MarkdownString[] = [
          getRunMarkdownCodeBlockMarkdown(document.uri, codeBlock),
        ];

        const maybeSelectedLinesHover = getRunSelectedLinesMarkdown(
          position,
          languageId
        );

        if (maybeSelectedLinesHover) {
          hoverContents.push(maybeSelectedLinesHover);
        }

        return new vscode.Hover(hoverContents);
      }
    }
  }
}
