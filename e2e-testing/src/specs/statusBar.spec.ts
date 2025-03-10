import {
  InputBox,
  QuickPickItem,
  StatusBar,
  VSBrowser,
} from 'vscode-extension-tester';
import {
  getSidebarViewItem,
  openFileResources,
  SIMPLE_TICKING3_PY,
  SIMPLE_TICKING_MD,
  step,
  TEST_GROOVY,
  TEST_TXT,
} from '../util';
import { EditorViewExtended } from '../pageObjects';
import { assert } from 'chai';
import { SERVER_TITLE, STATUS_BAR_TITLE, VIEW_NAME } from '../util/constants';

describe('Status Bar Tests', () => {
  let editorView: EditorViewExtended;
  let statusBar: StatusBar;

  before(async () => {
    await openFileResources(
      SIMPLE_TICKING_MD.path,
      SIMPLE_TICKING3_PY.path,
      TEST_GROOVY.path,
      TEST_TXT.path
    );

    editorView = new EditorViewExtended();
    statusBar = new StatusBar();
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
        const statusBarItem = await statusBar.getItem(
          'plug  Deephaven: Disconnected'
        );

        if (isVisible) {
          assert.isDefined(statusBarItem, stepLabel);
        } else {
          assert.isUndefined(statusBarItem, stepLabel);
        }
      });
    }
  });

  it('should connect to server on click', async () => {
    await editorView.openTextEditor(SIMPLE_TICKING3_PY.name);

    await step(1, 'Click Deephaven status bar item', async () => {
      const statusBarItem = await statusBar.getItem(
        STATUS_BAR_TITLE.disconnected
      );
      assert.isDefined(statusBarItem);
      await statusBarItem.click();
    });

    await step(2, 'Select connection', async () => {
      const input = await InputBox.create();
      const qpItem = new QuickPickItem(0, input);
      await qpItem.click();

      // We could call `ViewControl.openView` to ensure DH view is opened, but we
      // want to test it opens automatically when a connection is initiated. The
      // 500ms sleep matches the timeout that `ViewControl.openView` uses but
      // without attempting to open the view.
      await VSBrowser.instance.driver.sleep(500);
    });

    step(3, 'Verify server node', async stepLabel => {
      const localhost1000Item = await getSidebarViewItem(
        VIEW_NAME.servers,
        SERVER_TITLE
      );

      assert.isDefined(localhost1000Item, stepLabel);
      assert.equal(
        await localhost1000Item.getText(),
        `${SERVER_TITLE}(1)`,
        stepLabel
      );
    });

    step(4, 'Verify connection node', async stepLabel => {
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
