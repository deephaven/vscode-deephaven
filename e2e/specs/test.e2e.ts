import { browser, expect } from '@wdio/globals';
import {
  closeAllEditors,
  hasConnectionStatusBarItem,
  openEditors,
  PYTHON_AND_GROOVY_SERVER_CONFIG,
  resetConfig,
  setConfigSectionSettings,
} from '../testUtils';

afterEach(async () => {
  await resetConfig();
  await closeAllEditors();
});

// There are some tests that can be used for reference in:
// https://github.com/stateful/vscode-marquee/blob/main/test/specs and
// https://github.com/webdriverio-community/wdio-vscode-service/blob/main/test/specs

describe('VS Code Extension Testing', () => {
  it('should be able to load VSCode', async () => {
    const workbench = await browser.getWorkbench();
    expect(await workbench.getTitleBar().getTitle()).toContain(
      '[Extension Development Host]'
    );
  });
});

describe('Connection status bar item', () => {
  beforeEach(async () => {
    await setConfigSectionSettings(
      'coreServers',
      PYTHON_AND_GROOVY_SERVER_CONFIG
    );
    await openEditors(['test.txt', 'test.groovy', 'test.py']);
  });

  ['test.groovy', 'test.py'].forEach(supportedTitle => {
    it(`should only be visible when a supported file type is active: ${supportedTitle}`, async () => {
      const workbench = await browser.getWorkbench();

      await workbench.getEditorView().openEditor(supportedTitle);
      expect(await hasConnectionStatusBarItem()).toBeTruthy();

      // Unsupported file type
      await workbench.getEditorView().openEditor('test.txt');
      expect(await hasConnectionStatusBarItem()).toBeFalsy();

      await workbench.getEditorView().openEditor(supportedTitle);
      expect(await hasConnectionStatusBarItem()).toBeTruthy();
    });
  });
});

describe('panels', () => {
  beforeEach(async () => {
    await setConfigSectionSettings(
      'coreServers',
      PYTHON_AND_GROOVY_SERVER_CONFIG
    );
    await openEditors(['simple_ticking3.py']);
  });

  it.only('should open panels', async () => {
    const workbench = await browser.getWorkbench();

    await workbench.getEditorView().openEditor('simple_ticking3.py');
    await $('.codelens-decoration .codicon-run-all').click();

    // We need this to wait until panels load
    await workbench.getAllWebviews();

    /* Test 1 */
    expect(await getTabs().map(parseTab)).toMatchSnapshot(
      '1: Tab groups - initial load'
    );

    /* Test 2 */
    await getTab('t1', 2).click();

    expect(await getTabs().map(parseTab)).toMatchSnapshot(
      '2: Tab groups - after clicking t1'
    );

    /* Test 3 */
    await getTabCloseAction('t1', 2).click();
    await getTabCloseAction('t2', 2).click();

    await getTab('simple_ticking3.py', 1).click();
    await $('.codelens-decoration .codicon-run-all').click();

    expect(await getTabs().map(parseTab)).toMatchSnapshot(
      '3: Tab groups - re-run after closing t1 and t2'
    );
  });
});

function getTab(
  title: string,
  editorGroup: number
): ReturnType<WebdriverIO.Browser['$']> {
  const selector =
    editorGroup > 1 ? `${title}, Editor Group ${editorGroup}` : title;
  return $(`.tab[aria-label="${selector}"`);
}

function getTabCloseAction(
  title: string,
  editorGroup: number
): ReturnType<WebdriverIO.Browser['$']> {
  return getTab(title, editorGroup).$('a.codicon-close');
}

function getTabs(): ReturnType<WebdriverIO.Browser['$$']> {
  return $$('.tab');
}

async function parseTab(tab: WebdriverIO.Element): Promise<{
  text: string;
  ariaLabel: string;
  isSelected?: true;
}> {
  const text = await tab.getText();
  const ariaLabel = await tab.getAttribute('aria-label');
  const isSelected = (await tab.getAttribute('aria-selected')) === 'true';

  return isSelected ? { text, ariaLabel, isSelected } : { text, ariaLabel };
}

// async function getTabs(): Promise<
//   {
//     text: string;
//     ariaLabel: string;
//     isSelected?: true;
//     ref: WebdriverIO.Element;
//   }[]
// > {
//   return $$('.tab').map(parseTab);
// }

// function stripRef<T extends { ref: WebdriverIO.Element }>(
//   obj: T
// ): Omit<T, 'ref'> {
//   // eslint-disable-next-line no-unused-vars
//   const { ref, ...rest } = obj;
//   return rest;
// }
