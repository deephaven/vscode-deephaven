import * as vscode from 'vscode';
import { ExtensionController } from './controllers';
import { ConfigService } from './services';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export function activate(context: vscode.ExtensionContext): void {
  const controller = new ExtensionController(context, ConfigService);

  context.subscriptions.push(controller);
}

export function deactivate(): void {}
