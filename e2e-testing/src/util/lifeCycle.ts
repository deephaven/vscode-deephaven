import {
  ActivityBar,
  EditorView,
  type ViewControl,
} from 'vscode-extension-tester';
import { disconnectFromServer } from './testUtils';
import { SERVER_TITLE } from './constants';
import { WorkbenchExtended } from '../pageObjects';

/**
 * Setup before running test suite.
 */
export async function setup(): Promise<ViewControl | undefined> {
  const chatCloseButton = await new WorkbenchExtended().getChatCloseButton();
  await chatCloseButton?.click();

  const explorer = await new ActivityBar().getViewControl('Explorer');

  if (!(await explorer?.isSelected())) {
    await explorer?.openView();
  }
  return explorer;
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
