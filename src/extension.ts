import * as vscode from 'vscode';
import { ExtensionController } from './controllers';
import { ConfigService } from './services';

let controller: ExtensionController | undefined;

export function activate(context: vscode.ExtensionContext): void {
  controller = new ExtensionController(context, ConfigService);
  context.subscriptions.push(controller);

  controller.activate();
}

export function deactivate(): void {
  controller?.deactivate();
}
