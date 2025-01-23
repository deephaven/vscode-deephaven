import { browser, expect } from '@wdio/globals';
import {
  closeAllEditors,
  getDhTabGroups,
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
    await workbench.executeCommand('Run Deephaven File');

    // We need this to wait until panels load
    await workbench.getAllWebviews();

    const tabGroups = await getDhTabGroups();
    expect(tabGroups).toMatchSnapshot('Initial tab groups');
  });
});
