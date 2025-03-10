import { Workbench } from 'vscode-extension-tester';
import { assert } from 'chai';
import { EditorViewExtended } from '../pageObjects';
import {
  getCodeLens,
  openFileResources,
  setup,
  SIMPLE_TICKING3_PY,
  step,
  teardown,
} from '../util';

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
  t2Selected: {
    title: 't2',
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
    await setup();
    await openFileResources(SIMPLE_TICKING3_PY.path);
    await new Workbench().executeCommand('View: Split Editor Down');
  });

  after(async () => {
    await teardown();
  });

  it('should open panels', async () => {
    const editorView = new EditorViewExtended();
    const editor = await editorView.openTextEditor(SIMPLE_TICKING3_PY.name);

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
            webViews: [{}, {}, { isVisible: true, hasContent: true }],
          },
        ],
        stepLabel
      );
    });

    await step(3, 'Switch to another tab', async stepLabel => {
      await editorView.openWebView('t1', 2);
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
              {},
              { hasContent: true },
            ],
          },
        ],
        stepLabel
      );
    });

    await step(4, 'Switch back to initial tab', async stepLabel => {
      await editorView.openWebView('t3', 2);
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
              { hasContent: true },
              {},
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

    await step(
      6,
      'Check panel load with 1 pre-existing tab',
      async stepLabel => {
        const runDhFileCodeLens = await getCodeLens(
          editor,
          'Run Deephaven File'
        );
        await runDhFileCodeLens.click();

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
              webViews: [{ isVisible: true, hasContent: true }, {}, {}],
            },
          ],
          stepLabel
        );
      }
    );

    await step(7, 'Move tab to new group', async stepLabel => {
      await editorView.openWebView('t3', 2);

      await new Workbench().executeCommand('View: Move Editor into Next Group');

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
            tabs: [expectedTabs.t1, expectedTabs.t2Selected],
            webViews: [{}, { isVisible: true, hasContent: true }],
          },
          {
            groupIndex: 3,
            tabs: [expectedTabs.t3Selected],
            webViews: [{ isVisible: true, hasContent: true }],
          },
        ],
        stepLabel
      );
    });

    await step(
      8,
      'Close tab in first panel grouping should re-open in last panel grouping',
      async stepLabel => {
        await editorView.closeEditor('t1', 2);

        const runDhFileCodeLens = await getCodeLens(
          editor,
          'Run Deephaven File'
        );
        await runDhFileCodeLens.click();

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
              tabs: [expectedTabs.t2Selected],
              webViews: [{ isVisible: true, hasContent: true }],
            },
            {
              groupIndex: 3,
              tabs: [expectedTabs.t3Selected, expectedTabs.t1],
              webViews: [{ isVisible: true, hasContent: true }, {}],
            },
          ],
          stepLabel
        );
      }
    );
  });
});
