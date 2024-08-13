import { browser, expect } from '@wdio/globals';
import {
  closeAllEditors,
  hasConnectionStatusBarItem,
  openEditors,
  PYTHON_AND_GROOVY_SERVER_CONFIG,
  resetConfiguration,
  setConfigSectionSettings,
} from '../testUtils';

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
      'core-servers',
      PYTHON_AND_GROOVY_SERVER_CONFIG
    );
    await openEditors(['test.txt', 'test.groovy', 'test.py']);
  });

  afterEach(async () => {
    await resetConfiguration();
    await closeAllEditors();
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

      // Set to empty array to clear all server configs
      await setConfigSectionSettings('core-servers', []);
      expect(await hasConnectionStatusBarItem()).toBeFalsy();
    });
  });
});
