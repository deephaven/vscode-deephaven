import * as vscode from 'vscode';
import { ICON_ID, RUN_CODE_COMMAND, type RunCodeCmdArgs } from '../common';
import type { IDisposable } from '../types';

/**
 * Provides inline editor code lenses for running Deephaven code.
 */
export class RunCommandCodeLensProvider
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
    // Always show the run all code lens
    const args: RunCodeCmdArgs = [document.uri];

    const codeLenses: vscode.CodeLens[] = [
      new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
        title: `$(${ICON_ID.runAll}) Run Deephaven File`,
        command: RUN_CODE_COMMAND,
        arguments: args,
      }),
    ];

    return codeLenses;
  }
}
