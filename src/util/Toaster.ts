import * as vscode from 'vscode';
import { DOWNLOAD_LOGS_CMD, DOWNLOAD_LOGS_TEXT } from '../common';
import { IToastService } from '../services';

/**
 * Show toast messages to user.
 */
export class Toaster implements IToastService {
  constructor() {}

  error = async (message: string): Promise<void> => {
    const response = await vscode.window.showErrorMessage(
      message,
      DOWNLOAD_LOGS_TEXT
    );

    // If user clicks "Download Logs" button
    if (response === DOWNLOAD_LOGS_TEXT) {
      await vscode.commands.executeCommand(DOWNLOAD_LOGS_CMD);
    }
  };

  info = async (message: string): Promise<void> => {
    await vscode.window.showInformationMessage(message);
  };
}
