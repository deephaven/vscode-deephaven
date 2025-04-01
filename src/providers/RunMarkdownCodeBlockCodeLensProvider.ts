import * as vscode from 'vscode';
import { ICON_ID, RUN_MARKDOWN_CODEBLOCK_CMD } from '../common';
import type { CodeBlock, IDisposable } from '../types';
import type { ParsedDocumentCache } from '../services';

/**
 * Provides inline editor code lenses for running Deephaven codeblocks in
 * Markdown files.
 */
export class RunMarkdownCodeBlockCodeLensProvider
  implements vscode.CodeLensProvider<vscode.CodeLens>, IDisposable
{
  constructor(codeBlockCache: ParsedDocumentCache<CodeBlock[]>) {
    this._codeBlockCache = codeBlockCache;

    vscode.workspace.onDidChangeConfiguration(() => {
      this._onDidChangeCodeLenses.fire();
    });
    vscode.window.onDidChangeTextEditorSelection(() => {
      this._onDidChangeCodeLenses.fire();
    });
  }

  private readonly _codeBlockCache: ParsedDocumentCache<CodeBlock[]>;

  private readonly _onDidChangeCodeLenses: vscode.EventEmitter<void> =
    new vscode.EventEmitter<void>();

  readonly onDidChangeCodeLenses: vscode.Event<void> =
    this._onDidChangeCodeLenses.event;

  dispose = async (): Promise<void> => {
    this._onDidChangeCodeLenses.dispose();
  };

  /**
   * Provide a hover for the given position and document.
   *
   * @param document The document in which the command was invoked.
   * @param position The position at which the command was invoked.
   * @param token A cancellation token.
   * @returns A hover or a thenable that resolves to such. The lack of a result can be
   * signaled by returning `undefined` or `null`.
   */
  provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    const codeBlocks = this._codeBlockCache.get(document);

    const codeLenses: vscode.CodeLens[] = codeBlocks.map(
      ({ languageId, range }) =>
        new vscode.CodeLens(
          // Put the code lens on the line before the code block
          new vscode.Range(range.start.line - 1, 0, range.start.line - 1, 0),
          {
            title: `$(${ICON_ID.runSelection}) Run Deephaven Block`,
            command: RUN_MARKDOWN_CODEBLOCK_CMD,
            arguments: [document.uri, languageId, range],
          }
        )
    );

    return codeLenses;
  }
}
