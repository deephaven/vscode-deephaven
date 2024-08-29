import * as vscode from 'vscode';

// Note that calls to `browser.executeWorkbench` cannot reference any variables
// or functions from the outside scope. They only have access to variables
// passed in as additional parameters.
// See https://www.npmjs.com/package/wdio-vscode-service#accessing-vscode-apis

// CONFIG_ROOT_KEY and ConfigSectionKey are based on `src/common/constants.ts`.
// We can't currently import source code from the extension into the e2e tests
// due to isolated tsconfigs. Should be fine for now since the duplication is
// small and tests should fail if things get out of sync. If this duplication
// grows, will need to figure out how to reconfigure to support importing from
// the source code.
const CONFIG_ROOT_KEY = 'deephaven' as const;
type ConfigSectionKey = 'coreServers' | 'enterpriseServers';

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
 */
export async function openEditors(editorTitles: string[]): Promise<void> {
  // See note about `executeWorkbench` at top of this file.
  await browser.executeWorkbench(
    async (vs: typeof vscode, editorTitles: string[]): Promise<void> => {
      const filePathsToOpen = editorTitles.map(
        title => `${vs.workspace.workspaceFolders?.[0]?.uri.path}/${title}`
      );

      for (const filePath of filePathsToOpen) {
        await vs.window.showTextDocument(vs.Uri.file(filePath));
      }
    },
    editorTitles
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
