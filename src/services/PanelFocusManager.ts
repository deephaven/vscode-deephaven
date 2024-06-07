import * as vscode from 'vscode';

/*
 * Panels steal focus when they finish loading which causes the run
 * buttons to disappear. To fix this:
 *
 * 1. Track a panel in `panelsPendingInitialFocus` before setting html (in `runEditorCode`)
 * 2. If panel state changes in a way that results in tabgroup changing, stop
 * tracking the panel and restore the focus to the original editor
 */
export class PanelFocusManager {
  /**
   * Panels steal focus when they finish loading which causes the run buttons to
   * disappear. To fix this:
   * 1. Track a panel in `panelsPendingInitialFocus` before setting html. We set
   * a counter of 2 because we expect 2 state changes to happen to the panel that
   * result in the tabgroup switching (1 when we call reveal and 1 when the panel
   * finishes loading and steals focus)
   * 2. If panel state changes in a way that results in tabgroup changing,
   * decrement the counter for the panel. Once the counter hits zero, restore
   * the focus to the original editor
   */
  private panelsPendingInitialFocus = new WeakMap<
    vscode.WebviewPanel,
    number
  >();

  initialize(panel: vscode.WebviewPanel): void {
    console.log('Initializing panel:', panel.title, 2);

    // Only count the last panel initialized
    this.panelsPendingInitialFocus = new WeakMap();
    this.panelsPendingInitialFocus.set(panel, 2);
  }

  /**
   * Try to stop panels from stealing focus when they finish loading as this
   * causes run buttons to disappear. Note that this does not address the issues
   * outline here: https://github.com/deephaven/vscode-deephaven/issues/1.
   *
   * @deprecated vscode v90 added an optional `workbench.editor.alwaysShowEditorActions`
   * https://code.visualstudio.com/updates/v1_90#_always-show-editor-actions
   * Setting this to true fixes part of the issue with panels stealing focus, so
   * this workaround may no longer be necessary. It still doesn't fix the issue
   * with changing the selected action which still seems to intermittently not
   * persist whenever a custom panel is visible.
   * @param panel
   * @returns
   */
  handleOnDidChangeViewState(panel: vscode.WebviewPanel): () => void {
    return (): void => {
      const uri = vscode.window.activeTextEditor?.document.uri;
      const activeTabGroupViewColumn =
        vscode.window.tabGroups.activeTabGroup.viewColumn;
      const activeEditorViewColumn = vscode.window.activeTextEditor!.viewColumn;

      const didChangeFocus =
        activeTabGroupViewColumn !== activeEditorViewColumn;

      const pendingChangeCount = this.panelsPendingInitialFocus.get(panel) ?? 0;

      console.log('Panel view state changed:', {
        panelTitle: panel.title,
        activeEditorViewColumn,
        activeTabGroupViewColumn,
        didChangeFocus,
        pendingChangeCount,
      });

      if (!uri || !didChangeFocus || pendingChangeCount <= 0) {
        return;
      }

      this.panelsPendingInitialFocus.set(panel, pendingChangeCount - 1);

      vscode.window.showTextDocument(uri, {
        preview: false,
        viewColumn: activeEditorViewColumn,
      });
    };
  }
}
