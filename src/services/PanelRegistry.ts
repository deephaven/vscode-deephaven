import * as vscode from 'vscode';

/**
 * Registry of webview panels.
 */
export class PanelRegistry {
  private panels = new Map<string, vscode.WebviewPanel>();

  has = (title: string): boolean => {
    return this.panels.has(title);
  };

  get = (title: string): vscode.WebviewPanel => {
    if (!this.has(title)) {
      throw new Error(`Panel not found: ${title}`);
    }

    return this.panels.get(title)!;
  };

  set = (title: string, panel: vscode.WebviewPanel): void => {
    this.panels.set(title, panel);
  };

  delete = (title: string): void => {
    this.panels.delete(title);
  };
}
