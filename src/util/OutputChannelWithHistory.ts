import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';

/**
 * Output channel wrapper that keeps a history of all appended lines.
 */
export class OutputChannelWithHistory implements vscode.OutputChannel {
  constructor(
    readonly context: vscode.ExtensionContext,
    readonly outputChannel: vscode.OutputChannel
  ) {
    this.name = outputChannel.name;

    // Have to bind this explicitly since function overloads prevent using
    // lexical binding via arrow function.
    this.show = this.show.bind(this);
  }

  private history: string[] = [];
  readonly name: string;

  /**
   * Append the given value to the channel. Also appends to the history.
   *
   * @param value A string, falsy values will not be printed.
   */
  append = (value: string): void => {
    this.history.push(value);
    return this.outputChannel.append(value);
  };

  /**
   * Append the given value and a line feed character
   * to the channel. Also appends to the history.
   *
   * @param value A string, falsy values will be printed.
   */
  appendLine = (value: string): void => {
    this.history.push(value);
    this.outputChannel.appendLine(value);
  };

  /**
   * Clear the history.
   */
  clearHistory = (): void => {
    this.history = [];
  };

  downloadHistoryToFile = async (): Promise<vscode.Uri | null> => {
    const response = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(
        `deephaven-vscode_${new Date()
          .toISOString()
          .substring(0, 19)
          .replace(/[:]/g, '')
          .replace('T', '_')}.log`
      ),
      filters: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        Logs: ['log'],
      },
    });

    if (response?.fsPath == null) {
      return null;
    }

    await fs.writeFile(response.fsPath, this.history.join('\n'));

    return response;
  };

  /**
   * Dispose and free associated resources.
   */
  dispose = (): void => {
    this.clearHistory();
    this.outputChannel.dispose();
  };

  /**
   * Removes all output from the channel. Also clears the history.
   */
  clear = (): void => {
    this.clearHistory();
    this.outputChannel.clear();
  };

  /**
   * Hide this channel from the UI.
   */
  hide = (): void => {
    return this.outputChannel.hide();
  };

  /**
   * Replaces all output from the channel with the given value. Also replaces
   * the history.
   *
   * @param value A string, falsy values will not be printed.
   */
  replace = (value: string): void => {
    this.history = [value];
    this.outputChannel.replace(value);
  };

  /**
   * Reveal this channel in the UI.
   *
   * @param preserveFocus When `true` the channel will not take focus.
   */
  show(preserveFocus?: boolean): void;
  /**
   * Reveal this channel in the UI.
   *
   * @deprecated Use the overload with just one parameter (`show(preserveFocus?: boolean): void`).
   *
   * @param column This argument is **deprecated** and will be ignored.
   * @param preserveFocus When `true` the channel will not take focus.
   */
  show(column?: vscode.ViewColumn, preserveFocus?: boolean): void;
  show(column?: unknown, preserveFocus?: unknown): void {
    return this.outputChannel.show(
      column as Parameters<vscode.OutputChannel['show']>[0],
      preserveFocus as Parameters<vscode.OutputChannel['show']>[1]
    );
  }
}
