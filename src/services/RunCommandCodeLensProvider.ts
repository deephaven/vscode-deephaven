import * as vscode from 'vscode';

/**
 * Provides inline editor code lenses for running Deephaven code.
 */
export class RunCommandCodeLensProvider
  implements vscode.CodeLensProvider<vscode.CodeLens>
{
  constructor() {
    vscode.workspace.onDidChangeConfiguration(() => {
      this._onDidChangeCodeLenses.fire();
    });
    vscode.window.onDidChangeTextEditorSelection(() => {
      this._onDidChangeCodeLenses.fire();
    });
  }

  private _onDidChangeCodeLenses: vscode.EventEmitter<void> =
    new vscode.EventEmitter<void>();

  onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    // Always show the run all code lens
    const codeLenses: vscode.CodeLens[] = [
      new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
        title: '$(run-all) Run Deephaven File',
        command: 'vscode-deephaven.runCode',
        arguments: [document.uri],
      }),
    ];

    const editor = vscode.window.activeTextEditor;

    // Show the run selected lines code lens if there is more than 1 line in the
    // doc and there is a non-whitespace selection.
    if (
      editor &&
      document.lineCount > 1 &&
      /\S/.test(editor.document.getText(editor.selection))
    ) {
      codeLenses.push(
        new vscode.CodeLens(editor.selection, {
          title: '$(run) Run Deephaven Selected Lines',
          command: 'vscode-deephaven.runSelection',
          arguments: [document.uri],
        })
      );
    }

    return codeLenses;
  }

  resolveCodeLens?(
    codeLens: vscode.CodeLens,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CodeLens> {
    return codeLens;
  }
}
