import { ActivityBar, EditorView } from 'vscode-extension-tester';
import { disconnectFromServer } from './testUtils';
import { SERVER_TITLE } from './constants';

/**
 * Setup before running test suite.
 */
export async function setup(): Promise<void> {
  const explorer = await new ActivityBar().getViewControl('Explorer');
  await explorer?.openView();
}

/**
 * Teardown after running test suite.
 */
export async function teardown(): Promise<void> {
  await new EditorView().closeAllEditors();
  await disconnectFromServer(SERVER_TITLE);
  const explorer = await new ActivityBar().getViewControl('Explorer');
  await explorer?.openView();
}
