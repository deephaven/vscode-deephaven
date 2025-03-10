import { ActivityBar, EditorView, VSBrowser } from 'vscode-extension-tester';
import { disconnectFromServer } from './testUtils';
import { SERVER_TITLE } from './constants';

/**
 * Setup before running test suite.
 */
export async function setup(): Promise<void> {
  const explorer = await new ActivityBar().getViewControl('Explorer');
  if (!(await explorer?.isSelected())) {
    await explorer?.openView();
  }
}

/**
 * Teardown after running test suite.
 */
export async function teardown(): Promise<void> {
  await new EditorView().closeAllEditors();

  await VSBrowser.instance.takeScreenshot('teardown-close-all-editors');

  try {
    await disconnectFromServer(SERVER_TITLE);
  } catch {}
}
