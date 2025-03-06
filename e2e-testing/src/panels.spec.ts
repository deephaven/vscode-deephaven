import { EditorView, Workbench } from 'vscode-extension-tester';
import path from 'node:path';
import { assert } from 'chai';
import { EditorViewExtended } from './pageObjects';
import { getCodeLens, openFileResources, step } from './testUtils';

const testWsPath = path.resolve(__dirname, '..', 'test-ws/');
const simpleTicking3Name = 'simple_ticking3.py';
const simpleTicking3Path = path.join(testWsPath, simpleTicking3Name);

const expectedTabs = {
  simpleTicking3: {
    title: 'simple_ticking3.py',
    isSelected: true,
    isWebView: false,
  },
  t1: {
    title: 't1',
    isSelected: false,
    isWebView: true,
  },
  t2: {
    title: 't2',
    isSelected: false,
    isWebView: true,
  },
  t3: {
    title: 't3',
    isSelected: false,
    isWebView: true,
  },
  t1Selected: {
    title: 't1',
    isSelected: true,
    isWebView: true,
  },
  t3Selected: {
    title: 't3',
    isSelected: true,
    isWebView: true,
  },
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

    await step(1, 'Run Deephaven File CodeLens', async () => {
      const runDhFileCodeLens = await getCodeLens(editor, 'Run Deephaven File');
      await runDhFileCodeLens.click();
      await editorView.waitForEditorGroup(2);
    });

    await step(2, 'Initial editor group state', async stepLabel => {
      const editorGroupsData = await editorView.getEditorGroupsData();
      assert.deepEqual(
        editorGroupsData,
        [
          {
            groupIndex: 0,
            tabs: [expectedTabs.simpleTicking3],
          },
          {
            groupIndex: 1,
            tabs: [expectedTabs.simpleTicking3],
          },
          {
            groupIndex: 2,
            tabs: [expectedTabs.t1, expectedTabs.t2, expectedTabs.t3Selected],
            webViews: [
              { isVisible: false },
              { isVisible: false },
              { isVisible: true, hasContent: true },
            ],
          },
        ],
        stepLabel
      );
    });

    await step(3, 'Switch to another tab', async stepLabel => {
      await editorView.openWebView(2, 't1');
      const editorGroupsData = await editorView.getEditorGroupsData();
      assert.deepEqual(
        editorGroupsData,
        [
          {
            groupIndex: 0,
            tabs: [expectedTabs.simpleTicking3],
          },
          {
            groupIndex: 1,
            tabs: [expectedTabs.simpleTicking3],
          },
          {
            groupIndex: 2,
            tabs: [expectedTabs.t1Selected, expectedTabs.t2, expectedTabs.t3],
            webViews: [
              { isVisible: true, hasContent: true },
              { isVisible: false },
              { isVisible: false, hasContent: true },
            ],
          },
        ],
        stepLabel
      );
    });

    await step(4, 'Switch back to initial tab', async stepLabel => {
      await editorView.openWebView(2, 't3');
      const editorGroupsData = await editorView.getEditorGroupsData();
      assert.deepEqual(
        editorGroupsData,
        [
          {
            groupIndex: 0,
            tabs: [expectedTabs.simpleTicking3],
          },
          {
            groupIndex: 1,
            tabs: [expectedTabs.simpleTicking3],
          },
          {
            groupIndex: 2,
            tabs: [expectedTabs.t1, expectedTabs.t2, expectedTabs.t3Selected],
            webViews: [
              { isVisible: false, hasContent: true },
              { isVisible: false },
              { isVisible: true, hasContent: true },
            ],
          },
        ],
        stepLabel
      );
    });

    await step(5, 'Close all but 1 tab', async stepLabel => {
      await editorView.closeEditor('t1', 2);
      await editorView.closeEditor('t2', 2);

      const editorGroupsData = await editorView.getEditorGroupsData();
      assert.deepEqual(
        editorGroupsData,
        [
          {
            groupIndex: 0,
            tabs: [expectedTabs.simpleTicking3],
          },
          {
            groupIndex: 1,
            tabs: [expectedTabs.simpleTicking3],
          },
          {
            groupIndex: 2,
            tabs: [expectedTabs.t3Selected],
            webViews: [{ isVisible: true, hasContent: true }],
          },
        ],
        stepLabel
      );
    });

    await step(6, 'Run Deephaven File CodeLens', async () => {
      const runDhFileCodeLens = await getCodeLens(editor, 'Run Deephaven File');
      await runDhFileCodeLens.click();
    });

    await step(
      7,
      'Check panel load with 1 pre-existing tab',
      async stepLabel => {
        const editorGroupsData = await editorView.getEditorGroupsData();
        assert.deepEqual(
          editorGroupsData,
          [
            {
              groupIndex: 0,
              tabs: [expectedTabs.simpleTicking3],
            },
            {
              groupIndex: 1,
              tabs: [expectedTabs.simpleTicking3],
            },
            {
              groupIndex: 2,
              tabs: [expectedTabs.t3Selected, expectedTabs.t1, expectedTabs.t2],
              webViews: [
                { isVisible: true, hasContent: true },
                { isVisible: false },
                { isVisible: false },
              ],
            },
          ],
          stepLabel
        );
      }
    );
  });
});
