import * as vscode from 'vscode';

// Note that calls to `browser.executeWorkbench` cannot reference any variables
// or functions from the outside scope. They only have access to variables
// passed in as additional parameters. Return values need to be JSON serializable.
// See https://www.npmjs.com/package/wdio-vscode-service#accessing-vscode-apis

// CONFIG_ROOT_KEY and ConfigSectionKey are based on `src/common/constants.ts`.
// We can't currently import source code from the extension into the e2e tests
// due to isolated tsconfigs. Should be fine for now since the duplication is
// small and tests should fail if things get out of sync. If this duplication
// grows, will need to figure out how to reconfigure to support importing from
// the source code.
const CONFIG_ROOT_KEY = 'deephaven' as const;
type ConfigSectionKey = 'coreServers' | 'enterpriseServers';

interface TabState {
  text: string;
  group: number;
  isSelected?: true;
}

export const PYTHON_AND_GROOVY_SERVER_CONFIG = [
  'http://localhost:10000',
  {
    consoleType: 'groovy',
    url: 'http://localhost:10001/',
  },
] as const;

/**
 * Find the connection status bar item if it is visible.
 */
export async function findConnectionStatusBarItem(): Promise<
  WebdriverIO.Element | undefined
> {
  const workbench = await browser.getWorkbench();

  return workbench.getStatusBar().getItem(
    // icon name, display text, tooltip
    'plug  Deephaven: Disconnected'
  );
}

/**
 * Check if the connection status bar item is visible.
 */
export async function hasConnectionStatusBarItem(): Promise<boolean> {
  return (await findConnectionStatusBarItem()) != null;
}

/**
 * Open editors with the given titles. Titles must correspond to files that
 * exist in the root of the workspace.
 * @param editorTitles The titles of the editors to open.
 * @param options Options for opening the editors.
 */
export async function openEditors(
  editorTitles: string[],
  options: vscode.TextDocumentShowOptions = {}
): Promise<void> {
  // See note about `executeWorkbench` at top of this file.
  await browser.executeWorkbench(
    async (
      vs: typeof vscode,
      editorTitles: string[],
      options: vscode.TextDocumentShowOptions
    ): Promise<void> => {
      const filePathsToOpen = editorTitles.map(
        title => `${vs.workspace.workspaceFolders?.[0]?.uri.path}/${title}`
      );

      for (const filePath of filePathsToOpen) {
        await vs.window.showTextDocument(vs.Uri.file(filePath), options);
      }
    },
    editorTitles,
    options
  );
}

/**
 * Close all editors.
 */
export async function closeAllEditors(): Promise<void> {
  const workbench = await browser.getWorkbench();
  await workbench.getEditorView().closeAllEditors();
}

/**
 * Get the configuration settings for the extension.
 * @returns The configuration settings for the extension.
 */
export async function getConfig(): Promise<vscode.WorkspaceConfiguration> {
  // See note about `executeWorkbench` at top of this file.
  return browser.executeWorkbench(async (vs: typeof vscode, extensionIdIn) => {
    return vs.workspace.getConfiguration(extensionIdIn);
  }, CONFIG_ROOT_KEY);
}

/**
 * Reset all configuration settings to their default values.
 */
export async function resetConfig(): Promise<void> {
  await setConfigSectionSettings('coreServers', undefined);
  await setConfigSectionSettings('enterpriseServers', undefined);
}

/**
 * Set the section settings in the extension configuration.
 * @param sectionKey The section key to set.
 * @param sectionValue The settings to set. Setting to `undefined` will
 * result in the default configuration vs defined value will actually clear the
 * config completely.
 */
export async function setConfigSectionSettings(
  sectionKey: ConfigSectionKey,
  sectionValue: unknown | undefined
): Promise<void> {
  // See note about `executeWorkbench` at top of this file.
  await browser.executeWorkbench(
    async (
      vs: typeof vscode,
      configRootKeyIn: typeof CONFIG_ROOT_KEY,
      sectionKeyIn: ConfigSectionKey,
      sectionValueIn: unknown | undefined
    ): Promise<void> => {
      await vs.workspace
        .getConfiguration(configRootKeyIn)
        .update(sectionKeyIn, sectionValueIn ?? undefined);
    },
    CONFIG_ROOT_KEY,
    sectionKey,
    sectionValue
  );
}

/**
 * Execute a command from the command palette.
 * @param cmdText Text to exectue
 */
export async function execPaletteCmd(cmdText: string): Promise<void> {
  await browser.keys(['F1']);
  await $('.quick-input-box input');
  await browser.keys(cmdText.split(''));
  await browser.keys(['Enter']);
}

/**
 * Simulate a mouse down followed by a mouse up event on the given element.
 * @param element Element to click
 * @param pauseMs Amount of time to pause between down and up events
 */
async function mouseDownUp(
  element: WebdriverIO.Element | ReturnType<WebdriverIO.Browser['$']>,
  pauseMs = 10
): Promise<void> {
  await browser
    .action('pointer')
    .move({ origin: element })
    .down({ button: 0 })
    .pause(pauseMs)
    .up({ button: 0 })
    .perform();
}

/**
 * Get the tab with the given title in the given editor group.
 * @param title
 * @param editorGroup
 * @returns The tab with the given title in the given editor group.
 */
export function getTab(
  title: string,
  editorGroup: number
): ReturnType<WebdriverIO.Browser['$']> {
  if (editorGroup === 1) {
    // The first tab group sometimes has the `Editor Group 1` suffx but
    // sometimes it doesn't, so use the `^=` selector to match.
    return $(`.tab[aria-label^="${title}"]`);
  }

  return $(`.tab[aria-label="${title}, Editor Group ${editorGroup}"]`);
}

/**
 * Get all tabs.
 */
export function getTabs(): ReturnType<WebdriverIO.Browser['$$']> {
  return $$('.tab');
}

/**
 * Parse tab into a format suitable for snapshot testing.
 * @param tab Tab to parse
 * @returns Tab state
 */
export async function parseTabState(
  tab: WebdriverIO.Element
): Promise<TabState> {
  const text = await tab.getText();
  const ariaLabel = await tab.getAttribute('aria-label');
  const isSelected = (await tab.getAttribute('aria-selected')) === 'true';
  const group = Number(ariaLabel.match(/Editor Group (\d+)/)?.[1] ?? 1);

  return isSelected ? { group, text, isSelected } : { group, text };
}

/**
 * Close the tab with the given title in the given editor group.
 * @param title Title of the tab to close
 * @param editorGroup Group containing the tab to close
 */
export function closeTab(title: string, editorGroup: number): Promise<void> {
  return getTab(title, editorGroup).$('a.codicon-close').click();
}

/**
 * Execute the "Run Deephaven File" codelens in the current editor.
 */
export async function execRunDhFileCodelens(): Promise<void> {
  const codeLens = $('.codelens-decoration .codicon-run-all');
  await codeLens.click();
}

/**
 * Select the tab with the given title in the given editor group.
 * @param title Title of the tab to select
 * @param editorGroup Group containing the tab to select
 * @returns The tab with the given title in the given editor group.
 */
export async function selectTab(
  title: string,
  editorGroup: number
): Promise<WebdriverIO.Element> {
  const tab = await getTab(title, editorGroup);

  // VS code seems to listen for mousedown events on tabs, so use this instead
  // of click
  await mouseDownUp(tab);

  return tab;
}
