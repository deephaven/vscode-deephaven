import * as vscode from 'vscode';

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
export async function findConnectionStatusBarItem() {
  const workbench = await browser.getWorkbench();

  return workbench.getStatusBar().getItem(
    // icon name, display text, tooltip
    'debug-disconnect  Deephaven: Disconnected, Connect to Deephaven'
  );
}

/**
 * Check if the connection status bar item is visible.
 */
export async function hasConnectionStatusBarItem() {
  return (await findConnectionStatusBarItem()) != null;
}

/**
 * Open editors with the given titles. Titles must correspond to files that
 * exist in the root of the workspace.
 * @param editorTitles The titles of the editors to open.
 */
export async function openEditors(editorTitles: string[]): Promise<void> {
  // Note that calls to `browser.executeWorkbench` cannot reference any variables
  // or functions from the outside scope. They only have access to variables
  // passed in as additional parameters.
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
 * Set the core server settings in the extension configuration.
 * @param config The core server settings to set. Setting to `undefined` will
 * result in the default configuration vs an `[]` will actually clear the config
 * completely.
 */
export async function setCoreServerSettings(
  config: readonly unknown[] | undefined
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
