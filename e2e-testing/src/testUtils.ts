import {
  By,
  InputBox,
  TitleBar,
  until,
  VSBrowser,
  WebElement,
  WebView,
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
 * Wrapper a labeled step in sequential code.
 * @param label step label
 * @param fn code to execute
 */
step.count = 0;
export async function step(
  label: string,
  fn: () => Promise<void>
): Promise<void> {
  ++step.count;
  // eslint-disable-next-line no-console
  console.log(`Step ${step.count}: ${label}`);
  await fn();
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
