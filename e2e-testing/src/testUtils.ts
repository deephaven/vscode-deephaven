import {
  By,
  InputBox,
  TextEditor,
  TitleBar,
  until,
  VSBrowser,
  WebElement,
  WebView,
  type CodeLens,
  type Locator,
} from 'vscode-extension-tester';
import os from 'node:os';

export interface TabData {
  title: string;
  isSelected: boolean;
  isWebView: boolean;
}

export interface EditorGroupData {
  groupIndex: number;
  tabs: TabData[];
}

export interface WebViewExtended extends WebView {
  switchToContentFrame: (timeout?: number) => Promise<void>;
}

export async function elementExists(locator: Locator): Promise<boolean> {
  const { driver } = VSBrowser.instance;
  return (await driver.findElements(locator)).length > 0;
}

export async function elementExistsEventually(
  locator: Locator
): Promise<boolean> {
  const { driver } = VSBrowser.instance;
  await driver.wait(until.elementLocated(locator));
  return true;
}

export async function elementIsLazyLoaded(locator: Locator): Promise<boolean> {
  const existsInitially = await elementExists(locator);
  if (existsInitially) {
    throw new Error('Element is already present before lazy loading');
  }

  return elementExistsEventually(locator);
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

  // In CI environment, openResources doesn't work on Linux. This workaround does.
  // https://github.com/redhat-developer/vscode-extension-tester/issues/506#issuecomment-1271156702
  const titleBar = new TitleBar();
  for (const filePath of filePaths) {
    const item = await titleBar.getItem('File');
    const fileMenu = await item!.select();
    const openItem = await fileMenu.getItem('Open File...');
    await openItem!.select();
    const input = await InputBox.create();
    await input.setText(filePath);
    await input.confirm();
  }
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
): Promise<CodeLens | undefined> {
  const ariaLabel = await editor.getAttribute('aria-label');

  // The `TextEditor.getCodeLens` method provided by `vscode-extension-tester`
  // does not seem to wait for the anchor element to be available, so we need
  // to wait for it ourselves. Including the `aria-label` to narrow down which
  // editor we are looking at.
  await VSBrowser.instance.driver.wait(
    until.elementLocated(
      By.css(
        `[aria-label="${ariaLabel}"] .contentWidgets span.codelens-decoration a`
      )
    )
  );

  return editor.getCodeLens(indexOrTitle);
}

/**
 * Switch to a frame based on the identifiers provided. If multiple identifiers
 * are provided, the function will switch nested frames. Each identifier can be
 * a numeric index of the frame, a CSS selector, or the actual iframe WebElement.
 * @param identifiers Identifiers of the nested frames to switch to
 * @returns A Promise that resolves when switching is complete.
 */
export async function switchToFrame(
  ...identifiers: [
    number | string | WebElement,
    ...(number | string | WebElement)[],
  ]
): Promise<void> {
  const { driver } = VSBrowser.instance;

  let iframe: WebElement | undefined;

  // Find the iframe element based on the identifier
  const findFrame = async (
    iframeOrIdentifier: string | number | WebElement
  ): Promise<WebElement | undefined> => {
    if (iframeOrIdentifier instanceof WebElement) {
      return iframeOrIdentifier;
    }

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
  };

  while (identifiers.length > 0) {
    const iframeOrIdentifier = identifiers.shift()!;

    iframe = await driver.wait(async () => findFrame(iframeOrIdentifier));

    if (iframe == null) {
      throw new Error(`Invalid iframe identifier ${iframeOrIdentifier}.`);
    }

    await driver.switchTo().frame(iframe);
  }
}
