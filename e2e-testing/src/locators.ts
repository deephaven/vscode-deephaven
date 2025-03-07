import { By } from 'vscode-extension-tester';

export const locators = {
  irisGrid: By.css('.iris-grid'),

  /** Locator for the containing div of a WebView */
  webViewContainer: (parentFlowToElementId: string) =>
    webViewLocator(parentFlowToElementId, 'container'),

  /** Locator for the top-level iframe for a WebView */
  webViewActiveIframe: (parentFlowToElementId: string) =>
    webViewLocator(parentFlowToElementId, 'iframe', 'visible'),
} as const;

/**
 * Return a locator for a WebView related element.
 * @param parentFlowToElementId identifier for the webview (provided by WebViewExtended.getParentFlowToElementId())
 * @param containerOrIframe identifier for which element to locate. Can be 'container' or 'iframe'.
 * @param visibility optional visibility of the element to locate. Can be 'visible' or 'hidden'.
 * @returns Locator for the element
 */
function webViewLocator(
  parentFlowToElementId: string,
  containerOrIframe: 'container' | 'iframe',
  visibility?: 'visible' | 'hidden'
): By {
  const andClause =
    visibility == null
      ? ''
      : ` and contains(@style, 'visibility: ${visibility}')`;

  const childPath = containerOrIframe === 'container' ? '' : '//iframe';

  return By.xpath(
    `//div[@data-parent-flow-to-element-id='${parentFlowToElementId}'${andClause}]${childPath}`
  );
}
