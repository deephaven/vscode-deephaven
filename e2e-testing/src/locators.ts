import { By } from 'vscode-extension-tester';

export const locators = {
  irisGrid: By.css('.iris-grid'),

  webView: (
    parentFlowToElementId: string,
    containerOrIframe: 'container' | 'iframe',
    visibility?: 'visible' | 'hidden'
  ): By => {
    const andClause =
      visibility == null
        ? ''
        : ` and contains(@style, 'visibility: ${visibility}')`;

    const childPath = containerOrIframe === 'container' ? '' : '//iframe';

    return By.xpath(
      `//div[@data-parent-flow-to-element-id='${parentFlowToElementId}'${andClause}]${childPath}`
    );
  },
} as const;
