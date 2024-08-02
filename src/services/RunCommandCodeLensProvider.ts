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

    // Show the run selected lines code lens if there is a selection and there
    // is more than one line in the document.
    if (vscode.window.activeTextEditor && document.lineCount > 1) {
      codeLenses.push(
        new vscode.CodeLens(vscode.window.activeTextEditor.selection, {
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
