import {
  EditorView,
  TextEditor,
  VSBrowser,
  type EditorGroup,
} from 'vscode-extension-tester';
import { type EditorGroupData, type TabData } from '../testUtils';
import { WebViewExtended } from './WebViewExtended';

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
