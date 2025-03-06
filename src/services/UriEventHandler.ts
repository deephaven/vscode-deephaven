import * as vscode from 'vscode';

/**
 * Uri event handler class that emits events when a URI is handled. This can be
 * registered via `vscode.window.registerUriHandler` to handle incoming URI
 * requests for Deephaven extension.
 */
export class UriEventHandler
  extends vscode.EventEmitter<vscode.Uri>
  implements vscode.UriHandler
{
  public handleUri(uri: vscode.Uri): void {
    this.fire(uri);
  }
}
