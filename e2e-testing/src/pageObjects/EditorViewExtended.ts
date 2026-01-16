import {
  By,
  EditorView,
  TextEditor,
  VSBrowser,
  type EditorGroup,
  type WebElement,
} from 'vscode-extension-tester';
import {
  extractErrorType,
  locators,
  switchToFrame,
  type EditorGroupData,
  type TabData,
  type WebViewData,
} from '../util';
import { WebViewExtended } from './WebViewExtended';

export class EditorViewExtended extends EditorView {
  /**
   * Get a serializable data representation for all editor groups, their tabs,
   * and associated webviews.
   * @returns Promise resolving to an array of EditorGroupData objects
   */
  async getEditorGroupsData(): Promise<EditorGroupData[]> {
    const groupDataList: EditorGroupData[] = [];
    let groupIndex = 0;
    for (const group of await this.getEditorGroups()) {
      const tabs: TabData[] = [];

      // An editor group may be associated with 0-n webviews
      let webViewCount = 0;

      for (const tab of await group.getOpenTabs()) {
        const title = await tab.getTitle();
        const isSelected = await tab.isSelected();
        const resourceName = await tab.getAttribute('data-resource-name');
        const isWebView = resourceName.startsWith('webview-');

        if (isWebView) {
          webViewCount += 1;
        }

        tabs.push({
          title,
          isSelected,
          isWebView,
        });
      }

      let webViews: WebViewData[] | undefined;

      if (webViewCount > 0) {
        const driver = this.getDriver();
        webViews = [];

        const webView = await new WebViewExtended(group).wait();
        const parentFlowToElementId = await webView.getParentFlowToElementId();

        // Each webview consists of a container div containing an iframe. The
        // container divs all get appended as siblings near the end of the
        // document body and are associated with an editor instance via
        // `parentFlowToElementId`. Only one of the containers will be visible
        // for each editor group, corresponding to the selected tab / active
        // editor instance within the group.
        const iframeContainers = await driver.findElements(
          locators.webViewContainer(parentFlowToElementId)
        );

        for (const container of iframeContainers) {
          const style = await container.getAttribute('style');
          const isVisible = style.includes('visibility: visible');

          // Grab current context so we can switch back to it
          const windowHandle = await driver.getWindowHandle();

          const iframeAccessor = async (): Promise<WebElement> =>
            container.findElement(By.xpath('.//iframe'));

          let hasContent = false;
          try {
            // Attempt to switch to nested content frame to see if content has
            // been loaded. Nested iframes won't exist if not, and this will fail.
            // WebView.switchToFrame() only switches to the webview container
            // that is currently visible. We want to inspect all of them, even
            // the hidden ones, so we use the `switchToFrame` utility function
            // instead.
            await switchToFrame(
              [
                iframeAccessor,
                WebViewExtended.activeFrameSelector,
                WebViewExtended.contentFrameSelector,
              ],
              // If tab is visible, we could possibly be loading for the first time,
              // so wait a little longer. If tab is invisible, the only scenario
              // where content would be there is if it has already loaded, so we
              // don't need to wait as long
              isVisible ? 3000 : 250
            );
            hasContent = true;
          } catch (err) {
            // We expect TimeoutErrors in standard case where there is no loaded
            // content. Other errors indicate something unexpected.
            if (extractErrorType(err) !== 'TimeoutError') {
              // eslint-disable-next-line no-console
              console.log('Err:', err);
            }
          } finally {
            // Reset context
            await driver.switchTo().window(windowHandle);
          }

          const webViewData: WebViewData = {};

          // Only set isVisible & hasContent if true to make test comparisons
          // easier to write / read
          if (isVisible) {
            webViewData.isVisible = true;
          }
          if (hasContent) {
            webViewData.hasContent = true;
          }
          webViews.push(webViewData);
        }
      }

      const groupData: EditorGroupData = {
        groupIndex: groupIndex++,
        tabs,
      };

      if (webViews) {
        groupData.webViews = webViews;
      }

      groupDataList.push(groupData);
    }

    return groupDataList;
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
   * Switch to a TextEditor tab with the given title + optional group index.
   * Throws if a matching Editor is found that isn't associated with a WebView.
   * @param groupIndex zero based index for the editor group
   * @param title title of the tab
   * @returns Promise resolving to `WebViewExtended` object
   */
  async openWebView(
    title: string,
    groupIndex?: number
  ): Promise<WebViewExtended> {
    const group = await this.getEditorGroup(groupIndex ?? 0);

    const tab = await group.getTabByTitle(title);
    const resourceName = await tab.getAttribute('data-resource-name');
    const isWebView = resourceName.startsWith('webview-');

    if (!isWebView) {
      throw new Error('Tab is not associated with a WebView');
    }

    await tab.select();

    return new WebViewExtended(group).waitForStable();
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
