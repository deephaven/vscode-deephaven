import { EditorView } from 'vscode-extension-tester';
import {
  disconnectFromServer,
  getElementOrNull,
  connectToServer,
  openFileResources,
} from './testUtils';
import { SERVER_TITLE } from './constants';
import { locators } from './locators';

/**
 * Setup before running test suite.
 */
export async function setup(
  ...initialFilePaths: [string, ...string[]]
): Promise<void> {
  try {
    const chatCloseButton = await getElementOrNull(locators.chatCloseButton);
    await chatCloseButton?.click();
  } catch {
    // Chat button not found or not interactable - continue anyway
  }

  // Need to open a file before login since an active editor is required for
  // Deephaven: Select Connection command to work
  await openFileResources(...initialFilePaths);

  await connectToServer();
}

/**
 * Teardown after running test suite.
 */
export async function teardown(): Promise<void> {
  await new EditorView().closeAllEditors();

  try {
    await disconnectFromServer(SERVER_TITLE);
  } catch {}
}
