import { browser, expect } from '@wdio/globals';

// There are some tests that can be used for reference in:
// https://github.com/stateful/vscode-marquee/blob/main/test/specs

describe('VS Code Extension Testing', () => {
  it('should be able to load VSCode', async () => {
    const workbench = await browser.getWorkbench();
    expect(await workbench.getTitleBar().getTitle()).toContain(
      '[Extension Development Host]'
    );
  });

  it('should load connection status bar item', async () => {
    const workbench = await browser.getWorkbench();

    const statusBarItem = await browser.waitUntil(async () => {
      return workbench.getStatusBar().getItem(
        // icon name, display text, tooltip
        'debug-disconnect  Deephaven: Disconnected, Connect to Deephaven'
      );
    });

    expect(statusBarItem).toBeDefined();
  });
});
