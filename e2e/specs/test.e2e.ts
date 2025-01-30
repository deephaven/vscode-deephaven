import { browser, expect } from '@wdio/globals';
import {
  closeAllEditors,
  closeTab,
  execRunDhFileCodelens,
  executePaletteCmd,
  getTabs,
  hasConnectionStatusBarItem,
  openEditors,
  parseTabState,
  PYTHON_AND_GROOVY_SERVER_CONFIG,
  resetConfig,
  selectTab,
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
    await execRunDhFileCodelens();

    // We need this to wait until panels load
    await workbench.getAllWebviews();

    /* Test 1 */
    expect(await getTabs().map(parseTabState)).toMatchSnapshot(
      '1: Tab groups - initial load'
    );

    /* Test 2 */
    await selectTab('t1', 2);

    expect(await getTabs().map(parseTabState)).toMatchSnapshot(
      '2: Tab groups - after clicking t1'
    );

    /* Test 3 */
    await closeTab('t1', 2);
    await closeTab('t2', 2);

    await selectTab('simple_ticking3.py', 1);
    await execRunDhFileCodelens();

    expect(await getTabs().map(parseTabState)).toMatchSnapshot(
      '3: Tab groups - re-run after closing t1 and t2'
    );

    /* Test 4 */
    await new Promise(resolve => setTimeout(resolve, 2000));
    await selectTab('t3', 2);

    await executePaletteCmd('View: Move Editor into Group Below');

    expect(await getTabs().map(parseTabState)).toMatchSnapshot(
      '4: Tab groups - after dragging t1 to a new tab group'
    );

    /* Test 5 */
    await closeTab('t1', 2);

    await selectTab('simple_ticking3.py', 1);
    await execRunDhFileCodelens();

    expect(await getTabs().map(parseTabState)).toMatchSnapshot(
      '5: Tab groups - multiple tab groups re-run after closing t1'
    );
  });
});
