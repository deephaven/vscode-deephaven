import * as vscode from 'vscode';
import { ExtensionController } from './controllers';
import { ConfigService } from './services';

export function activate(context: vscode.ExtensionContext): void {
  const controller = new ExtensionController(context, ConfigService);

  context.subscriptions.push(controller);
}

export function deactivate(): void {}
