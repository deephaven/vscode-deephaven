import * as vscode from 'vscode';
import type { Disposable } from '../types';

/**
 * Base controller class.
 */
export abstract class ControllerBase implements Disposable {
  protected readonly disposables: Disposable[] = [];

  /**
   * Register a command and add it's subscription to the disposables list.
   */
  registerCommand = (
    ...args: Parameters<typeof vscode.commands.registerCommand>
  ): void => {
    const cmd = vscode.commands.registerCommand(...args);
    this.disposables.push(cmd);
  };

  /**
   * Dispose all registered disposables.
   */
  async dispose(): Promise<void> {
    const disposing = this.disposables.map(subscription =>
      subscription.dispose()
    );
    this.disposables.length = 0;

    await Promise.all(disposing);
  }
}
