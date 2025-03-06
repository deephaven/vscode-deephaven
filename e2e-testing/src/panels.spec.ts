import { EditorView, Workbench } from 'vscode-extension-tester';
import path from 'node:path';
import {
  elementExists,
  elementIsLazyLoaded,
  openFileResources,
  type EditorGroupData,
} from './testUtils';
import { assert } from 'chai';
import { locators } from './locators';
import { EditorViewExtended } from './pageObjects';

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
  before(async () => {
    await new EditorView().closeAllEditors();

    await openFileResources(simpleTicking3Path);

    await new Workbench().executeCommand('View: Split Editor Down');
  });

  it('should open panels', async () => {
    const editorView = new EditorViewExtended();
    const editor = await editorView.openTextEditor(simpleTicking3Name);
    const runDhFile = await editor.getCodeLens('Run Deephaven File');

    await runDhFile?.click();

    await editorView.waitForEditorGroup(2);

    const editorGroupsData = await editorView.getEditorGroupsData();
    assert.deepEqual(editorGroupsData, expectedGroupState.initial);

    // Tab 3 should be selected already since it was the last query to be run.
    let t3 = await editorView.openWebView(2, 't3', true);
    await t3.switchToContentFrame();
    assert.isTrue(
      await elementIsLazyLoaded(locators.irisGrid),
      'Iris grid should be automatically loaded for initially active panel'
    );
    await t3.switchBack();

    // Switch to tab 1
    const t1 = await editorView.openWebView(2, 't1');
    await t1.switchToContentFrame();
    assert.isTrue(
      await elementIsLazyLoaded(locators.irisGrid),
      'Iris grid should be loaded after panel becomes active'
    );
    await t1.switchBack();

    // Switch back to tab 3
    t3 = await editorView.openWebView(2, 't3');
    await t3.switchToContentFrame();
    assert.isTrue(
      await elementExists(locators.irisGrid),
      'Iris grid should already exist when switching back to previously loaded panel'
    );
    await t3.switchBack();
  });
});
