import { EditorView, VSBrowser, Workbench } from 'vscode-extension-tester';
import fs from 'node:fs';
import path from 'node:path';
import { getCodeLens, openTextEditor } from './testUtils';

const testWsPath = path.resolve(__dirname, '..', 'test-ws/');
const simpleTicking3 = 'simple_ticking3.py';
const simpleTicking3Path = path.resolve(testWsPath, simpleTicking3);

describe('Panels Tests', () => {
  let timerMs = 0;

  before(async () => {
    timerMs = performance.now();
    await new EditorView().closeAllEditors();

    // eslint-disable-next-line no-console
    console.log(
      'Path exists:',
      simpleTicking3Path,
      fs.existsSync(simpleTicking3Path)
    );

    // Open script in 2 different tab groups
    // eslint-disable-next-line no-console
    console.log('Opening resources:', testWsPath, simpleTicking3Path);
    await VSBrowser.instance.openResources(testWsPath, simpleTicking3Path);
    await new Workbench().executeCommand('View: Split Editor Down');
  });

  after(async () => {
    timerMs = performance.now() - timerMs;

    // eslint-disable-next-line no-console
    console.log(`Panels Tests took ${timerMs}ms`);
  });

  it('should open panels', async () => {
    await VSBrowser.instance.takeScreenshot('panels');

    const editor = await openTextEditor(simpleTicking3);
    const runDhFile = await getCodeLens(editor, 'Run Deephaven File');

    await runDhFile?.click();
  });
});
