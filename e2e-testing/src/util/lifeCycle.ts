import { EditorView } from 'vscode-extension-tester';
import {
  getElementOrNull,
  openFileResources,
  openActivityBarView,
  disconnectFromServers,
  closeActivityBarView,
} from './testUtils';
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

  // Ensure Deephaven extension is activated by opening the Deephaven view
  await openActivityBarView('Deephaven');

  await closeActivityBarView('Deephaven');
}

/**
 * Teardown after running test suite.
 */
export async function teardown(): Promise<void> {
  await new EditorView().closeAllEditors();

  try {
    await disconnectFromServers();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error during disconnectFromServers:', err);
  }
}
