import {
  By,
  EditorView,
  InputBox,
  TextEditor,
  TitleBar,
  until,
  VSBrowser,
  WebElement,
  WebView,
  type CodeLens,
  type EditorGroup,
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

export class EditorViewExtended extends EditorView {
  /**
   * Get a serializable data representation for all editor groups + their tabs.
   * @returns Promise resolving to an array of EditorGroupData objects
   */
  async getEditorGroupsData(): Promise<EditorGroupData[]> {
    const groups = [];
    let groupIndex = 0;
    for (const group of await this.getEditorGroups()) {
      const tabs: TabData[] = [];

      for (const tab of await group.getOpenTabs()) {
        const title = await tab.getTitle();
        const isSelected = await tab.isSelected();
        const resourceName = await tab.getAttribute('data-resource-name');
        const isWebView = resourceName.startsWith('webview-');

        tabs.push({
          title,
          isSelected,
          isWebView,
        });
      }

      groups.push({
        groupIndex: groupIndex++,
        tabs,
      });
    }

    return groups;
  }

  /**
   * Switch to a TextEditor tab with the given title + optional group index. Throws
   * if a matching Editor is found that isn't an instance of a TextEditor.
   * @param title title of the tab
   * @param groupIndex zero based index for the editor group (0 for the left most group)
   * @returns Promise resolving to TextEditor object
   */
  async openTextEditor(
    title: string,
    groupIndex?: number
  ): Promise<TextEditor> {
    const editor = await this.openEditor(title, groupIndex);

    if (!(editor instanceof TextEditor)) {
      throw new Error('Editor is not a text editor');
    }

    return editor;
  }

  /**
   * Switch to an WebView tab with the given title + optional group index.
   * Extend the `WebView` as an `WebViewExtended` object.
   * @param title title of the tab
   * @param groupIndex zero based index for the editor group
   * @returns Promise resolving to `WebViewExtended` object
   */
  async openWebView(
    title: string,
    groupIndex?: number
  ): Promise<WebViewExtended> {
    const editor = await this.openEditor(title, groupIndex);

    if (!(editor instanceof WebView)) {
      throw new Error('Editor is not a webview');
    }

    return extendWebView(editor);
  }

  /**
   * Wait for an editor group to be available
   * @param groupIndex zero based index for the editor group
   * @returns Promise resolving to EditorGroup object
   */
  async waitForEditorGroup(groupIndex: number): Promise<EditorGroup> {
    await VSBrowser.instance.driver.wait(
      async () => (await this.getEditorGroups()).length > groupIndex
    );

    return this.getEditorGroup(groupIndex);
  }
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
 * Extend a WebView object with additional methods.
 * @param webView WebView object to extend
 * @returns Promise resolving to the extended WebView object
 */
export async function extendWebView(
  webView: WebView
): Promise<WebViewExtended> {
  const { driver } = VSBrowser.instance;

  let windowHandle: string | undefined;

  const self = webView as WebViewExtended;

  /**
   * Switch to the content iframe of the webview which is nested inside of the
   * iframe associated with `WebView.switchToFrame()`.
   */
  self.switchToContentFrame = async (timeout?: number): Promise<void> => {
    await self.switchToFrame(timeout);
    await switchToFrame('#content-iframe');
  };

  // There is a `vscode-extension-tester` bug that breaks `switchToFrame` in
  // cases where there are multiple WebViews in the same tab group.
  // https://github.com/redhat-developer/vscode-extension-tester/issues/1798
  // For now, overriding the method with a version that works. If / when the
  // bug is fixed, we should be able to remove this method + the hacked `switchBack`
  // method.
  self.switchToFrame = async (timeout?: number): Promise<void> => {
    // Keep current window handle so we can switch back to it later
    if (!windowHandle) {
      windowHandle = await driver.getWindowHandle();
    }

    // VS Code creates a div.editor-container element for each tab group.
    // This div contains a div.editor-instance element that represents the
    // currently selected tab within the group (this is represented by the
    // `editor` element returned by `openEditor`). In cases where the selected
    // tab is a webview, there will be a unique `webview-editor-[some-guid]`
    // id that is used to link the editor instance with all of the webviews
    // managed by the tab group. This id is set in the first child of the
    // editor element as well as the `data-parent-flow-to-element-id` attribute
    // of the related divs that contain the webview iframes. These divs are
    // in a separate DOM tree than the editor instance, so they have to be
    // accessed by the id linkage.
    const webviewLinkId = await self
      .findElement(By.css('div'))
      .getAttribute('id');

    // Find the iframe that contains the webview the open editor + active
    // tab. It should be the only one with a visible parent.
    const iframeLocator = By.xpath(
      `//div[@data-parent-flow-to-element-id='${webviewLinkId}' and contains(@style, 'visibility: visible')]//iframe`
    );

    const iframe = await driver.wait(
      until.elementLocated(iframeLocator),
      timeout
    );

    await switchToFrame(iframe, '#active-frame');
  };

  /**
   * This is needed since we are replacing `switchToFrame`. If / when the bug
   * https://github.com/redhat-developer/vscode-extension-tester/issues/1798 is
   * fixed, we should be able to remove the hacked `switchToFrame` method as
   * well as this one.
   * @returns
   */
  self.switchBack = async (): Promise<void> => {
    if (!windowHandle) {
      windowHandle = await driver.getWindowHandle();
    }

    return driver.switchTo().window(windowHandle);
  };

  return self;
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
