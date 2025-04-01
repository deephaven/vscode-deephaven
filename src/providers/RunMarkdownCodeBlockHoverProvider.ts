import * as vscode from 'vscode';
import { URIMap } from '../services';
import {
  assertDefined,
  parseMarkdownCodeblocks,
  serializeRange,
} from '../util';
import type { CodeBlock } from '../types';
import { ICON_ID, RUN_MARKDOWN_CODEBLOCK_CMD } from '../common';

/**
 * Hover provider that provides a button to run a Deephaven code block in a Markdown file.
 */
export class RunMarkdownCodeBlockHoverProvider implements vscode.HoverProvider {
  private readonly _codeBlockCache = new URIMap<CodeBlock[]>();
  private readonly _lastDocumentVersion = new URIMap<number>();

  constructor() {
    // Update caches on document change
    vscode.workspace.onDidChangeTextDocument(event => {
      const document = event.document;
      const uri = document.uri;
      const lastVersion = this._lastDocumentVersion.get(uri);

      if (lastVersion == null || lastVersion < document.version) {
        this._updateCache(document);
      }
    });

    // Clear caches on document close
    vscode.workspace.onDidCloseTextDocument(document => {
      this._codeBlockCache.delete(document.uri);
      this._lastDocumentVersion.delete(document.uri);
    });
  }

  /** Update Caches */
  private _updateCache(document: vscode.TextDocument): void {
    const uri = document.uri;

    const codeBlocks = parseMarkdownCodeblocks(document);

    this._codeBlockCache.set(uri, codeBlocks);
    this._lastDocumentVersion.set(uri, document.version);
  }

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
    const lastVersion = this._lastDocumentVersion.get(document.uri);

    if (lastVersion !== document.version) {
      this._updateCache(document);
    }

    const codeBlocks = this._codeBlockCache.get(document.uri);

    assertDefined(codeBlocks, 'codeBlocks');

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
