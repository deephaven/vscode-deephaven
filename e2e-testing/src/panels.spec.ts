import {
  By,
  EditorView,
  until,
  VSBrowser,
  Workbench,
  type WebDriver,
} from 'vscode-extension-tester';
import path from 'node:path';
import {
  EditorViewExtended,
  getCodeLens,
  openFileResources,
  type EditorGroupData,
} from './testUtils';
import { assert } from 'chai';

const testWsPath = path.resolve(__dirname, '..', 'test-ws/');
const simpleTicking3Name = 'simple_ticking3.py';
const simpleTicking3Path = path.join(testWsPath, simpleTicking3Name);

const expectedGroupState: Record<string, EditorGroupData[]> = {
  initial: [
    {
      groupIndex: 0,
      tabs: [
        {
          title: 'simple_ticking3.py',
          isSelected: true,
          isWebView: false,
        },
      ],
    },
    {
      groupIndex: 1,
      tabs: [
        {
          title: 'simple_ticking3.py',
          isSelected: true,
          isWebView: false,
        },
      ],
    },
    {
      groupIndex: 2,
      tabs: [
        {
          title: 't1',
          isSelected: false,
          isWebView: true,
        },
        {
          title: 't2',
          isSelected: false,
          isWebView: true,
        },
        {
          title: 't3',
          isSelected: true,
          isWebView: true,
        },
      ],
    },
  ],
};

describe('Panels Tests', () => {
  let driver: WebDriver;

  before(async () => {
    await new EditorView().closeAllEditors();

    await openFileResources(simpleTicking3Path);

    await new Workbench().executeCommand('View: Split Editor Down');

    driver = VSBrowser.instance.driver;
  });

  it('should open panels', async () => {
    const editorView = new EditorViewExtended();
    const editor = await editorView.openTextEditor(simpleTicking3Name);
    const runDhFile = await getCodeLens(editor, 'Run Deephaven File');

    await runDhFile?.click();

    const group2 = await editorView.waitForEditorGroup(2);

    const editorGroupsData = await editorView.getEditorGroupsData();
    assert.deepEqual(editorGroupsData, expectedGroupState.initial);

    const activeTabTitle = await (await group2.getActiveTab())?.getTitle();
    assert.strictEqual(activeTabTitle, 't3', 't3 should be active');

    const t3 = await editorView.openWebView('t3', 2);
    await t3.switchToContentFrame();

    const irisGrid = await driver.wait(
      until.elementLocated(By.css('.iris-grid'))
    );

    assert.isDefined(irisGrid, 'Iris grid should be present');

    await VSBrowser.instance.takeScreenshot('panels2');
  });
});
