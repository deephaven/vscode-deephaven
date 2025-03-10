import type { WebElement } from 'vscode-extension-tester';

export interface TabData {
  title: string;
  isSelected: boolean;
  isWebView: boolean;
}

export interface WebViewData {
  isVisible?: true;
  hasContent?: true;
}

export interface EditorGroupData {
  groupIndex: number;
  tabs: TabData[];
  webViews?: WebViewData[];
}

/**
 * Selector for an iframe. Can be a numeric index in the frames collection of
 * current context, a CSS selector string, or a function that returns a Promise
 * resolving to a WebElement.
 */
export type FrameSelector = number | string | (() => Promise<WebElement>);
