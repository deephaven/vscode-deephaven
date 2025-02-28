import {
  By,
  EditorView,
  TextEditor,
  until,
  VSBrowser,
  type CodeLens,
  type Editor,
} from 'vscode-extension-tester';

export function isTextEditor(editor: Editor): editor is TextEditor {
  return editor instanceof TextEditor;
}

export async function openTextEditor(
  title: string,
  groupIndex?: number
): Promise<TextEditor> {
  const editorView = new EditorView();
  const editor = await editorView.openEditor(title, groupIndex);

  if (!isTextEditor(editor)) {
    throw new Error('Editor is not a text editor');
  }

  return editor;
}

export async function getCodeLens(
  editor: TextEditor,
  indexOrTitle: number | string
): Promise<CodeLens | undefined> {
  const ariaLabel = await editor.getAttribute('aria-label');

  // The `TextEditor.getCodeLens` method provided by `vscode-extension-tester`
  // does not seem to wait for the anchor element to be available, so we need
  // to wait for it ourselves. Including the `aria-label` to narrow down which
  // editor we are looking at.
  await VSBrowser.instance.driver.wait(
    until.elementLocated(
      By.css(
        `[aria-label="${ariaLabel}"] .contentWidgets span.codelens-decoration a`
      )
    )
  );

  return editor.getCodeLens(indexOrTitle);
}
