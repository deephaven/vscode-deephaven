import * as vscode from 'vscode';
import { ICON_ID, RUN_MARKDOWN_CODEBLOCK_CMD } from '../common';
import type { IDisposable } from '../types';

/**
 * Provides inline editor code lenses for running Deephaven codeblocks in
 * Markdown files.
 */
export class RunMarkdownCodeBlockCodeLensProvider
  implements vscode.CodeLensProvider<vscode.CodeLens>, IDisposable
{
  constructor() {
    vscode.workspace.onDidChangeConfiguration(() => {
      this._onDidChangeCodeLenses.fire();
    });
    vscode.window.onDidChangeTextEditorSelection(() => {
      this._onDidChangeCodeLenses.fire();
    });
  }

  private readonly _onDidChangeCodeLenses: vscode.EventEmitter<void> =
    new vscode.EventEmitter<void>();

  readonly onDidChangeCodeLenses: vscode.Event<void> =
    this._onDidChangeCodeLenses.event;

  dispose = async (): Promise<void> => {
    this._onDidChangeCodeLenses.dispose();
  };

  provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    const lines = document.getText().split('\n');

    const ranges: [string, vscode.Range][] = [];
    let start: vscode.Position | null = null;
    let languageId = '';

    // Create ranges for each code block in the document
    for (let i = 0; i < lines.length; ++i) {
      const line = lines[i];

      if (line === '```' && start) {
        ranges.push([
          languageId,
          new vscode.Range(start, new vscode.Position(i - 1, 0)),
        ]);
        start = null;
      } else if (line === '```python' || line === '```groovy') {
        languageId = line.substring(3);
        start = new vscode.Position(i + 1, 0);
      }
    }

    const codeLenses: vscode.CodeLens[] = ranges.map(
      ([languageId, range]) =>
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
