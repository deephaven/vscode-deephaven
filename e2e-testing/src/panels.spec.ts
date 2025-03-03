import { EditorView, VSBrowser, Workbench } from 'vscode-extension-tester';
import path from 'node:path';
import { getCodeLens, openResources, openTextEditor } from './testUtils';

const testWsPath = path.resolve(__dirname, '..', 'test-ws/');
const simpleTicking3 = 'simple_ticking3.py';

describe('Panels Tests', () => {
  let timerMs = 0;

  before(async () => {
    timerMs = performance.now();
    await new EditorView().closeAllEditors();

    // Open script in 2 different tab groups
    // eslint-disable-next-line no-console
    console.log('Opening resources:', testWsPath, simpleTicking3);

    await openResources(testWsPath, simpleTicking3);

    await new Workbench().executeCommand('View: Split Editor Down');

    await VSBrowser.instance.takeScreenshot('panels');
  });

  after(async () => {
    timerMs = performance.now() - timerMs;

    // eslint-disable-next-line no-console
    console.log(`Panels Tests took ${timerMs}ms`);
  });

  it('should open panels', async () => {
    const editor = await openTextEditor(simpleTicking3);
    const runDhFile = await getCodeLens(editor, 'Run Deephaven File');

    await runDhFile?.click();

    await new Promise(resolve => setTimeout(resolve, 5000));

    await VSBrowser.instance.takeScreenshot('panels2');
  });
});
