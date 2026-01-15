import {
  ActivityBar,
  By,
  InputBox,
  SideBarView,
  StatusBar,
  VSBrowser,
  WebElement,
  Workbench,
  type CodeLens,
  type Locator,
  type Notification,
  type TextEditor,
  type ViewControl,
  type ViewItem,
} from 'vscode-extension-tester';
import seleniumWebDriver from 'selenium-webdriver';
import os from 'node:os';
import { RETRY_SWITCH_IFRAME_ERRORS, STATUS_BAR_TITLE } from './constants';
import type { FrameSelector } from './types';
import { assert } from 'chai';

/**
 * Connect to Deephaven server using `Deephaven: Select Connection` command.
 * This always picks the first server in the quick pick list which works fine
 * for now since our tests only configure a single server. May need to make
 * this more flexible in the future. Also, there needs to be an active editor
 * for the command to work, so ensure a file is opened before calling this
 * function.
 */
export async function connectToServer(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('Connecting to Deephaven server...');

  await executeCommandWithRetry('Deephaven: Select Connection');
  const input = await InputBox.create();
  // Note that this assumes there is only 1 server configured so we pick the
  // first one in the list. Will need to be updated if we want to test scenarios
  // where multiple servers are configured.
  await input.selectQuickPick(0);

  let firstInputBox: InputBox | null = null;
  try {
    firstInputBox = await InputBox.create(2000);
  } catch {}

  if (firstInputBox != null) {
    const username = process.env.DH_USERNAME ?? 'vscode_testuser';
    const password = process.env.DH_PASSWORD ?? username;

    await firstInputBox.setText(username);
    await firstInputBox.confirm();

    const passwordInputBox = await InputBox.create();
    await passwordInputBox.setText(password);
    await passwordInputBox.confirm();
  }

  // Wait for connection to be active
  const notification = await VSBrowser.instance.driver.wait(
    getServerConnectedNotification
  );
  await notification?.dismiss();
}

/**
 * Disconnect from all Deephaven servers by clicking on disconnect action on
 * server nodes.
 */
export async function disconnectFromServers(): Promise<void> {
  const sideBarView = new SideBarView();
  const serverSection = await sideBarView.getContent().getSection('Servers');

  const items = await serverSection.getVisibleItems();
  for (const item of items) {
    const level = await item.getAttribute('aria-level');
    if (level === '2') {
      await item.select();
      const disconnectAction = await getElementOrNull(
        By.css('[aria-label="Disconnect from Server"]'),
        item
      );
      await disconnectAction?.click();
    }
  }
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
 * The `chai` `assert.deepEqual` is a little lacking in output when arrays don't
 * match, so this function provides a more detailed error messages.
 * @param actual array to check
 * @param expected expected array to match
 * @param label label to use in error messages
 */
export async function expectDeepEqualArray<T>(
  actual: T[],
  expected: T[],
  label: string
): Promise<void> {
  if (actual.length !== expected.length) {
    throw new Error(
      `${label} Array length mismatch. Actual: ${actual.length}, Expected: ${expected.length}`
    );
  }

  for (let i = 0; i < actual.length; i += 1) {
    assert.deepEqual(
      actual[i],
      expected[i],
      `${label} Array element mismatch at index ${i}. Expected ${JSON.stringify(expected[i])}, but got ${JSON.stringify(actual[i])}`
    );
  }
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
 * Look for element based on locator, returning null if not found.
 * @param locator Locator to look for
 * @param parent Optional parent element to search within. If not provided, searches from driver root.
 * @returns Element if found, null otherwise
 */
export async function getElementOrNull(
  locator: Locator,
  parent?: { findElements(locator: Locator): Promise<WebElement[]> }
): Promise<WebElement | null> {
  const searchContext = parent ?? VSBrowser.instance.driver;
  return (await searchContext.findElements(locator))[0] ?? null;
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
 * Get the Deephaven status bar item if it exists.
 * @returns Deephaven status bar item or null if not found
 */
export async function getDhStatusBarItem(): Promise<WebElement | null> {
  const statusBar = new StatusBar();
  const items = await statusBar.getItems();

  for (const item of items) {
    let ariaLabel = '';
    try {
      ariaLabel = await item.getAttribute('aria-label');
    } catch (err) {
      if (
        !(err instanceof seleniumWebDriver.error.StaleElementReferenceError)
      ) {
        throw err;
      }
    }

    if (
      ariaLabel === STATUS_BAR_TITLE.disconnected ||
      ariaLabel.startsWith(STATUS_BAR_TITLE.connectedPrefix)
    ) {
      return item;
    }
  }

  return null;
}

/**
 * Execute a VS Code command with retry logic to handle intermittent
 * "element not interactible" errors.
 * @param command Command to execute
 * @param maxRetries Maximum number of retry attempts
 * @param retryDelay Delay in milliseconds between retries
 */
export async function executeCommandWithRetry(
  command: string,
  maxRetries = 1,
  retryDelay = 500
): Promise<void> {
  const driver = VSBrowser.instance.driver;

  for (let retryAttempt = 0; retryAttempt <= maxRetries; retryAttempt++) {
    try {
      await new Workbench().executeCommand(command);
      return;
    } catch (error) {
      const isRetryable =
        error instanceof seleniumWebDriver.error.ElementNotInteractableError &&
        retryAttempt < maxRetries;

      if (!isRetryable) {
        throw error;
      }

      await driver.sleep(retryDelay);
    }
  }
}

export async function getServerConnectedNotification(): Promise<Notification | null> {
  const notifications = await new Workbench().getNotifications();

  for (const notification of notifications) {
    const message = await notification.getMessage();
    if (message.startsWith('Created Deephaven session:')) {
      return notification;
    }
  }

  return null;
}

/**
 * Open an activity bar view by name.
 * @param name Name of view to open
 * @returns ViewControl of opened view or undefined if not found
 */
export async function openActivityBarView(
  name: string
): Promise<ViewControl | undefined> {
  const activityBar = new ActivityBar();
  const viewControl = await activityBar.getViewControl(name);

  if (viewControl && !(await viewControl.isSelected())) {
    await viewControl.openView();
    // For some reason, viewControl is not ready to be closed immediately after
    // opening, so wait a bit to avoid upstream surprises.
    await VSBrowser.instance.driver.sleep(500);
  }

  return viewControl;
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
    await executeCommandWithRetry('workbench.action.quickOpen');

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
