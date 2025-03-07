import {
  By,
  EditorView,
  TextEditor,
  VSBrowser,
  type EditorGroup,
  type WebElement,
} from 'vscode-extension-tester';
import {
  switchToFrame,
  type EditorGroupData,
  type TabData,
  type WebViewData,
} from '../testUtils';
import { WebViewExtended } from './WebViewExtended';
import { locators } from '../locators';

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

      let hasWebView = false;
      for (const tab of await group.getOpenTabs()) {
        const title = await tab.getTitle();
        const isSelected = await tab.isSelected();
        const resourceName = await tab.getAttribute('data-resource-name');
        const isWebView = resourceName.startsWith('webview-');

        if (isWebView) {
          hasWebView = true;
        }

        tabs.push({
          title,
          isSelected,
          isWebView,
        });
      }

      let webViews: WebViewData[] | undefined;

      if (hasWebView) {
        const driver = this.getDriver();
        webViews = [];

        const webView = await new WebViewExtended(group).wait();
        const parentFlowToElementId = await webView.getParentFlowToElementId();
        const iframeContainers = await driver.findElements(
          locators.webView(parentFlowToElementId, 'container')
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
          } finally {
            // Reset context
            await driver.switchTo().window(windowHandle);
          }

          const webViewData: WebViewData = { isVisible };
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
   * Get the WebView tab for a given tab group and title. If the tab is not
   * currently active, it will be selected unless `throwIfTitleNotAlreadyActive`
   * is set to true, in which case it will throw an error.
   * @param groupIndex zero based index for the editor group
   * @param title title of the tab
   * @param throwIfTitleNotAlreadyActive if true, throw if the tab is not already active
   * @returns Promise resolving to `WebViewExtended` object
   */
  async openWebView(
    groupIndex: number,
    title: string,
    throwIfTitleNotAlreadyActive = false
  ): Promise<WebViewExtended> {
    const group = await this.getEditorGroup(groupIndex);

    const activeTab = await group.getActiveTab();
    const activeTitle = activeTab && (await activeTab?.getTitle());
    const isTitleAlreadyActive = activeTitle === title;

    if (throwIfTitleNotAlreadyActive && !isTitleAlreadyActive) {
      throw new Error(
        `Expected tab title to be "${title}", but was "${activeTitle}"`
      );
    }

    if (!isTitleAlreadyActive) {
      const tab = await group.getTabByTitle(title);
      await tab.select();
    }

    return new WebViewExtended(group).wait();
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
