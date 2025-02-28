import {
  EditorView,
  InputBox,
  TitleBar,
  VSBrowser,
  Workbench,
} from 'vscode-extension-tester';
import fs from 'node:fs';
import path from 'node:path';
import { getCodeLens, openTextEditor } from './testUtils';

const testWsPath = path.resolve(__dirname, '..', 'test-ws/');
const simpleTicking3 = 'simple_ticking3.py';
const simpleTicking3Path = path.resolve(testWsPath, simpleTicking3);

async function openEditor(wsPath: string, file: string): Promise<void> {
  const titleBar = new TitleBar();
  const item = await titleBar.getItem('File');
  const fileMenu = await item!.select();
  const openItem = await fileMenu.getItem('Open File...');
  await openItem!.select();
  const input = await InputBox.create();
  await input.setText(path.join(wsPath, file));
  await input.confirm();
}

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
  });

  after(async () => {
    timerMs = performance.now() - timerMs;

    // eslint-disable-next-line no-console
    console.log(`Panels Tests took ${timerMs}ms`);
  });

  it('should open panels', async () => {
    await VSBrowser.instance.openResources(testWsPath, simpleTicking3Path);
    await openEditor(testWsPath, simpleTicking3);

    await new Workbench().executeCommand('View: Split Editor Down');

    await VSBrowser.instance.takeScreenshot('panels');

    const editor = await openTextEditor(simpleTicking3);
    const runDhFile = await getCodeLens(editor, 'Run Deephaven File');

    await runDhFile?.click();

    await new Promise(resolve => setTimeout(resolve, 5000));

    await VSBrowser.instance.takeScreenshot('panels2');
  });
});
