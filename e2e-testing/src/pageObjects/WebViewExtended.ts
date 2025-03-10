import { By, until, WebView, type WebElement } from 'vscode-extension-tester';
import { locators, switchToFrame } from '../util';

export class WebViewExtended extends WebView {
  static activeFrameSelector = '#active-frame';
  static contentFrameSelector = '#content-iframe';

  private windowHandle: string | undefined;

  /**
   * Get the id used to associate a webview editor instance with container divs
   * that contain the webview iframes.
   * @returns Promise resolving to the id
   */
  async getParentFlowToElementId(): Promise<string> {
    return this.findElement(By.css('div')).getAttribute('id');
  }

  /**
   * Switch to the content iframe of the webview which is nested inside of the
   * iframe associated with `WebView.switchToFrame()`. This is the context we
   * need to interact with the DH embed widget content.
   */
  async switchToContentFrame(timeout?: number): Promise<void> {
    await this.switchToFrame(timeout);
    await switchToFrame([WebViewExtended.contentFrameSelector]);
  }

  /*
   * HACK: Overriding `WebView.switchToFrame` method from `vscode-extension-tester`.
   * There is a `vscode-extension-tester` bug that breaks `switchToFrame` in
   * cases where there are multiple WebViews in the same tab group.
   * https://github.com/redhat-developer/vscode-extension-tester/issues/1798
   * For now, overriding the method with a version that works. If / when the
   * bug is fixed, we should be able to remove this method + the hacked `switchBack`
   * method.
   */
  async switchToFrame(timeout?: number): Promise<void> {
    // Keep current window handle so we can switch back to it later
    if (!this.windowHandle) {
      this.windowHandle = await this.getDriver().getWindowHandle();
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
    const parentFlowToElementId = await this.getParentFlowToElementId();

    // Find the iframe that contains the webview the open editor + active
    // tab. It should be the only one with a visible parent.
    const iframeAccessor = async (): Promise<WebElement> =>
      this.getDriver().wait(
        until.elementLocated(
          locators.webViewActiveIframe(parentFlowToElementId)
        ),
        timeout
      );

    await switchToFrame(
      [iframeAccessor, WebViewExtended.activeFrameSelector],
      timeout
    );
  }

  /**
   * HACK: Overriding `WebView.switchBack` method from `vscode-extension-tester`.
   * This is needed since we are overriding `switchToFrame`. If / when the bug
   * https://github.com/redhat-developer/vscode-extension-tester/issues/1798 is
   * fixed, we should be able to remove the hacked `switchToFrame` method as
   * well as this one.
   * @returns
   */
  async switchBack(): Promise<void> {
    if (!this.windowHandle) {
      this.windowHandle = await this.getDriver().getWindowHandle();
    }

    return this.getDriver().switchTo().window(this.windowHandle);
  }
}
