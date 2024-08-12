import * as vscode from 'vscode';
import { ExtensionController } from './services';

export function activate(context: vscode.ExtensionContext): void {
  const controller = new ExtensionController(context);

  context.subscriptions.push(controller);
}

export function deactivate(): void {}
