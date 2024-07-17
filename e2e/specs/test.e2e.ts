import { browser, expect } from '@wdio/globals';

describe('VS Code Extension Testing', () => {
  it('should be able to load VSCode', async () => {
    const workbench = await browser.getWorkbench();
    expect(await workbench.getTitleBar().getTitle()).toContain(
      '[Extension Development Host]'
    );
  });

  it('should load connection status bar item', async () => {
    const workbench = await browser.getWorkbench();
    const statusBarItem = workbench
      .getStatusBar()
      .getItem('Deephaven: Disconnected');
    expect(statusBarItem).not.toBeUndefined();
  });
});
