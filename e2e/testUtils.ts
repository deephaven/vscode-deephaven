import * as vscode from 'vscode';

export const PYTHON_AND_GROOVY_SERVER_CONFIG = [
  'http://localhost:10000',
  {
    consoleType: 'groovy',
    url: 'http://localhost:10001/',
  },
] as const;

export async function findStatusBarItem() {
  const workbench = await browser.getWorkbench();

  return workbench.getStatusBar().getItem(
    // icon name, display text, tooltip
    'debug-disconnect  Deephaven: Disconnected, Connect to Deephaven'
  );
}

export async function hasStatusBarItem() {
  return (await findStatusBarItem()) != null;
}

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

export async function closeAllEditors(): Promise<void> {
  const workbench = await browser.getWorkbench();
  await workbench.getEditorView().closeAllEditors();
}

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
