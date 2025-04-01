import * as vscode from 'vscode';
import { ParsedDocumentCache } from '../services';
import { serializeRange } from '../util';
import { ICON_ID, RUN_MARKDOWN_CODEBLOCK_CMD } from '../common';
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

    for (const { languageId, range } of codeBlocks) {
      if (range.contains(position)) {
        const argsStr = JSON.stringify([
          document.uri,
          languageId,
          serializeRange(range),
        ]);
        const argsEncoded = encodeURIComponent(argsStr);

        const hoverContent = new vscode.MarkdownString(
          `[$(${ICON_ID.runSelection}) Run Deephaven Block](command:${RUN_MARKDOWN_CODEBLOCK_CMD}?${argsEncoded})`,
          true
        );

        hoverContent.isTrusted = {
          enabledCommands: [RUN_MARKDOWN_CODEBLOCK_CMD],
        };

        return new vscode.Hover(hoverContent);
      }
    }
  }
}
