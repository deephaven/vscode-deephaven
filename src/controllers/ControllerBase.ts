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
  registerCommand = <TThis = any>(
    command: string,
    callback: (this: TThis, ...args: any[]) => any,
    thisArg?: TThis
  ): void => {
    const cmd = vscode.commands.registerCommand(command, callback, thisArg);
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
