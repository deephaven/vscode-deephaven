import * as vscode from 'vscode';
import { browser, expect } from '@wdio/globals';

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
  const pythonAndGroovyServerConfig = [
    'http://localhost:10000',
    {
      consoleType: 'groovy',
      url: 'http://localhost:10001/',
    },
  ];

  async function findStatusBarItem() {
    const workbench = await browser.getWorkbench();

    return workbench.getStatusBar().getItem(
      // icon name, display text, tooltip
      'debug-disconnect  Deephaven: Disconnected, Connect to Deephaven'
    );
  }

  async function hasStatusBarItem() {
    return (await findStatusBarItem()) != null;
  }

  async function setCoreServerSettings(
    config: unknown[] | undefined
  ): Promise<void> {
    // Note that calls to `browser.executeWorkbench` cannot reference any variables
    // or functions from the outside scope. They only have access to variables
    // passed in as additional parameters.
    await browser.executeWorkbench(
      async (vs: typeof vscode, config): Promise<void> => {
        await vs.workspace
          .getConfiguration('vscode-deephaven')
          .update('core-servers', config ?? undefined);
      },
      config
    );
  }

  async function openFiles(): Promise<void> {
    // Note that calls to `browser.executeWorkbench` cannot reference any variables
    // or functions from the outside scope. They only have access to variables
    // passed in as additional parameters.
    await browser.executeWorkbench(async (vs: typeof vscode): Promise<void> => {
      const filePathsToOpen = ['test.txt', 'test.groovy', 'test.py'].map(
        name => `${vs.workspace.workspaceFolders?.[0]?.uri.path}/${name}`
      );

      for (const filePath of filePathsToOpen) {
        await vs.window.showTextDocument(vs.Uri.file(filePath));
      }
    });
  }

  beforeEach(async () => {
    await setCoreServerSettings(pythonAndGroovyServerConfig);
    await openFiles();
  });

  afterEach(async () => {
    await setCoreServerSettings(undefined);
  });

  ['test.groovy', 'test.py'].forEach(supportedTitle => {
    it(`should only be visible when a supported file type is active: ${supportedTitle}`, async () => {
      const workbench = await browser.getWorkbench();

      await workbench.getEditorView().openEditor(supportedTitle);
      expect(await hasStatusBarItem()).toBeTruthy();

      // Unsupported file type
      await workbench.getEditorView().openEditor('test.txt');
      expect(await hasStatusBarItem()).toBeFalsy();

      await workbench.getEditorView().openEditor(supportedTitle);
      expect(await hasStatusBarItem()).toBeTruthy();

      // Set to empty string to clear all server configs
      await setCoreServerSettings([]);
      expect(await hasStatusBarItem()).toBeFalsy();
    });
  });
});
