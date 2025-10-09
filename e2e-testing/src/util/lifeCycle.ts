import {
  ActivityBar,
  EditorView,
  type ViewControl,
} from 'vscode-extension-tester';
import { disconnectFromServer, getElementOrNull } from './testUtils';
import { SERVER_TITLE } from './constants';
import { locators } from './locators';

/**
 * Setup before running test suite.
 */
export async function setup(): Promise<ViewControl | undefined> {
  const chatCloseButton = await getElementOrNull(locators.chatCloseButton);
  // eslint-disable-next-line no-console
  console.log('chatCloseButton found:', chatCloseButton != null);

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
