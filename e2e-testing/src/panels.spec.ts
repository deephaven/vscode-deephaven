import { EditorView, VSBrowser, Workbench } from 'vscode-extension-tester';
import path from 'node:path';
import { getCodeLens, openTextEditor } from './testUtils';

const testWsPath = path.resolve(__dirname, '..', 'test-ws');
const simpleTicking3 = 'simple_ticking3.py';
const simpleTicking3Path = path.resolve(testWsPath, simpleTicking3);

describe('Panels Tests', () => {
  before(async () => {
    await new EditorView().closeAllEditors();

    // Open script in 2 different tab groups
    await VSBrowser.instance.openResources(testWsPath, simpleTicking3Path);
    await new Workbench().executeCommand('View: Split Editor Down');
  });

  it('should open panels', async () => {
    const editor = await openTextEditor(simpleTicking3);
    const runDhFile = await getCodeLens(editor, 'Run Deephaven File');

    await runDhFile?.click();

    console.log('test');
  });
});
