import { InputBox } from 'vscode-extension-tester';
import {
  getDhStatusBarItem,
  getServerItems,
  getSidebarViewItem,
  setup,
  SIMPLE_TICKING3_PY,
  SIMPLE_TICKING_MD,
  step,
  teardown,
  TEST_GROOVY,
  TEST_TXT,
  waitForServerConnection,
} from '../util';
import { EditorViewExtended } from '../pageObjects';
import { assert } from 'chai';
import { VIEW_NAME } from '../util/constants';

describe('Status Bar Tests', () => {
  let editorView: EditorViewExtended;

  before(async () => {
    await setup(
      SIMPLE_TICKING_MD.path,
      SIMPLE_TICKING3_PY.path,
      TEST_GROOVY.path,
      TEST_TXT.path
    );

    editorView = new EditorViewExtended();
  });

  after(async () => {
    await teardown();
  });

  it('should only show Deephaven status bar item for supported file types', async () => {
    for (const [s, fileName, isVisible] of [
      [1, TEST_TXT.name, false],
      [2, SIMPLE_TICKING3_PY.name, true],
      [3, TEST_TXT.name, false],
      [4, TEST_GROOVY.name, true],
      [5, TEST_TXT.name, false],
      [6, SIMPLE_TICKING_MD.name, true],
      [7, TEST_TXT.name, false],
    ] as const) {
      await step(s, fileName, async stepLabel => {
        await editorView.openTextEditor(fileName);
        const statusBarItem = await getDhStatusBarItem();

        if (isVisible) {
          assert.isDefined(null, stepLabel);
        } else {
          assert.isNull(statusBarItem, stepLabel);
        }
      });
    }
  });

  it('should connect to server on click', async () => {
    await editorView.openTextEditor(SIMPLE_TICKING3_PY.name);

    await step(1, 'Click Deephaven status bar item', async stepLabel => {
      const statusBarItem = await getDhStatusBarItem();
      assert.isNotNull(statusBarItem, stepLabel);
      await statusBarItem.click();
    });

    await step(2, 'Select connection', async () => {
      const input = await InputBox.create();
      await input.selectQuickPick(0);

      await waitForServerConnection();
    });

    await step(3, 'Verify server node', async stepLabel => {
      const [serverItem] = await getServerItems();

      assert.isDefined(serverItem, stepLabel);
    });

    await step(4, 'Verify connection node', async stepLabel => {
      const simpleTickingEditor = await getSidebarViewItem(
        VIEW_NAME.connections,
        SIMPLE_TICKING3_PY.name
      );

      assert.isDefined(simpleTickingEditor, stepLabel);
      assert.equal(
        await simpleTickingEditor?.getText(),
        `${SIMPLE_TICKING3_PY.name}${SIMPLE_TICKING3_PY.path}`,
        stepLabel
      );
    });
  });
});
