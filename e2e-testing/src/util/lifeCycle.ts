import { ActivityBar, EditorView, VSBrowser } from 'vscode-extension-tester';
import { disconnectFromServer } from './testUtils';
import { SERVER_TITLE } from './constants';

/**
 * Setup before running test suite.
 */
export async function setup(): Promise<void> {
  // Ensure we have a clean slate from any previous test suites
  await new EditorView().closeAllEditors();

  await VSBrowser.instance.driver.sleep(1000);

  try {
    await disconnectFromServer(SERVER_TITLE);
  } catch {}

  const explorer = await new ActivityBar().getViewControl('Explorer');
  if (!(await explorer?.isSelected())) {
    await explorer?.openView();
  }
}
