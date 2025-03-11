import {
  By,
  InputBox,
  SideBarView,
  VSBrowser,
  WebElement,
  Workbench,
  type CodeLens,
  type Locator,
  type TextEditor,
  type ViewItem,
} from 'vscode-extension-tester';
import os from 'node:os';
import { RETRY_SWITCH_IFRAME_ERRORS } from './constants';
import type { FrameSelector } from './types';

/**
 * Disconnect from Deephaven server by clicking on disconnect action on server
 * node.
 * @param title Title of server node to disconnect from
 */
export async function disconnectFromServer(title: string): Promise<void> {
  const serverViewItem = await getSidebarViewItem('Servers', title);
  await serverViewItem?.select();
  const disconnectAction = await serverViewItem?.findElement(
    By.css('[aria-label="Disconnect from Server"]')
  );
  await disconnectAction?.click();
}

/**
 * Check if an element exists in the current context. This is needed since the
 * default Selenium driver `findElement` methods throw if element not found.
 * @param locator Locator of element to check
 * @returns True if element exists, false otherwise
 */
export async function elementExists(locator: Locator): Promise<boolean> {
  const { driver } = VSBrowser.instance;
  return (await driver.findElements(locator)).length > 0;
}

/**
 * We don't have access to some of the underlying error classes from
 * vscode-extension-tester, but we can approximate the type of error by grabbing
 * any text before the first colon.
 * @param error Error to extract type from
 * @returns Error type
 */
export function extractErrorType(error: unknown): string {
  return String(error).split(':')[0];
}

/**
 * Get a sidebar view item based on section and title.
 * @param section Section of sidebar view to get item from
 * @param title Title of item to get
 * @returns Sidebar view item
 */
export async function getSidebarViewItem(
  section: string,
  title: string
): Promise<ViewItem | undefined> {
  const sideBarView = new SideBarView();
  const serverSection = await sideBarView.getContent().getSection(section);
  return serverSection.findItem(title);
}

/**
 * Get a code lens based on title, or zero based index
 * @param editor Editor to get code lens from
 * @param indexOrTitle Index or title of code lens to get
 * @returns CodeLens
 */
export async function getCodeLens(
  editor: TextEditor,
  indexOrTitle: number | string
): Promise<CodeLens> {
  // The `TextEditor.getCodeLens` method provided by `vscode-extension-tester`
  // does not seem to explicitly wait for the element to be available, which
  // sometimes works, and sometimes does not. To be safe, we need wait for it
  // ourselves.
  return VSBrowser.instance.driver.wait<CodeLens>(async () =>
    editor.getCodeLens(indexOrTitle)
  );
}

/**
 * Open a list of files in VS Code.
 * @param filePaths Paths of files to open (requires at least one path)
 */
export async function openFileResources(
  ...filePaths: [string, ...string[]]
): Promise<void> {
  if (['win32', 'darwin'].includes(os.platform())) {
    await VSBrowser.instance.openResources(...filePaths);
    return;
  }

  // eslint-disable-next-line no-console
  console.log('Opening filePaths:', filePaths);

  // In CI environment, openResources doesn't work on Linux. Using the quick open
  // input as a workaround.
  // See https://github.com/redhat-developer/vscode-extension-tester/issues/506#issuecomment-2715696218
  for (const filePath of filePaths) {
    await new Workbench().executeCommand('workbench.action.quickOpen');

    const input = await InputBox.create();
    await input.setText(filePath);
    await input.confirm();
  }
}

/**
 * Execute "Run Deephaven File" code lens in the given editor.
 * @param editor Editor to execute code lens in
 */
export async function runDhFileCodeLens(editor: TextEditor): Promise<void> {
  const runDhFileCodeLens = await getCodeLens(editor, 'Run Deephaven File');
  await runDhFileCodeLens.click();
}

/**
 * Call a function as a labeled step in sequential code.
 * @param n step number
 * @param label step label
 * @param fn code to execute
 * @returns result of code execution
 * @example <caption>Example Step Usage</caption>
 * await step(1, 'Open file', async () => {
 *   await openFileResources('test.py');
 *   const editor = await new EditorView().openTextEditor('test.py');
 *   await runDhFileCodeLens(editor);
 * });
 */
export async function step<TResult>(
  n: number,
  label: string,
  fn: (stepLabel: string) => Promise<TResult>
): Promise<TResult> {
  const stepLabel = `Step ${n}: ${label}`;
  // eslint-disable-next-line no-console
  console.log(stepLabel);
  return fn(stepLabel);
}

/**
 * Switch to a frame based on the identifiers provided. If multiple identifiers
 * are provided, the function will switch nested frames. Each identifier can be
 * a numeric index of the frame, a CSS selector, or the actual iframe WebElement.
 * @param identifiers Identifiers of the nested frames to switch to
 * @returns A Promise that resolves when switching is complete.
 */
export async function switchToFrame(
  identifiers: [FrameSelector, ...FrameSelector[]],
  timeout?: number
): Promise<void> {
  const { driver } = VSBrowser.instance;

  let iframe: WebElement | undefined;

  // Find the iframe element based on the identifier
  const findFrame = async (
    iframeOrIdentifier: FrameSelector
  ): Promise<WebElement | undefined> => {
    if (typeof iframeOrIdentifier === 'number') {
      const iframes = await driver.findElements({
        tagName: 'iframe',
      });

      return iframes.at(iframeOrIdentifier);
    }

    if (typeof iframeOrIdentifier === 'string') {
      // Using `findElements` since `findElement` throws an error if no elements
      // are found
      const [iframe] = await driver.findElements(By.css(iframeOrIdentifier));
      return iframe;
    }

    return iframeOrIdentifier();
  };

  while (identifiers.length > 0) {
    const iframeOrIdentifier = identifiers.shift()!;

    iframe = await driver.wait<WebElement>(
      async () => findFrame(iframeOrIdentifier),
      timeout
    );

    try {
      await driver.switchTo().frame(iframe);
    } catch (err) {
      const errorType = extractErrorType(err);

      // Iframes can thrash around a bit as panels are loading.
      // `RETRY_SWITCH_IFRAME_ERRORS` represent cases where it's worth
      // requerying an iframe and attempting to switch again. If it's not 1 of
      // these kind of errors, bail.
      if (!RETRY_SWITCH_IFRAME_ERRORS.has(errorType)) {
        throw err;
      }

      // eslint-disable-next-line no-console
      console.log(`Retrying after '${errorType}' error`);

      // Try retrieving the iframe and switching again
      iframe = await driver.wait<WebElement>(
        async () => findFrame(iframeOrIdentifier),
        timeout
      );

      try {
        await driver.switchTo().frame(iframe);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.log(`Failed to switch to frame: ${iframeOrIdentifier}`, err);
        throw err;
      }
    }
  }
}
