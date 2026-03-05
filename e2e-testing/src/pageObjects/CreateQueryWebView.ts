import { By, VSBrowser } from 'vscode-extension-tester';
import { switchToFrame } from '../util';

/**
 * Page object for the "Create Connection" WebviewView panel that appears in the
 * "Deephaven Detail" sidebar when connecting to a server with the
 * `createQueryIframe` feature. Handles three levels of iframe nesting:
 *   1. Outer VS Code webview iframe — `iframe[src*="purpose=webviewView"]`
 *   2. `#active-frame` — VS Code's internal webview wrapper
 *   3. `#content-iframe` — the DH server UI with the actual form
 *
 * Note: the vscode-extension-tester `WebviewView` class is not used here.
 * Its `switchToFrame()` navigates outer → `#active-frame` (levels 1–2) via
 * bounding-rect matching, but it silently no-ops (returns without throwing)
 * if no suitable iframe is found. More importantly, it does not navigate to
 * `#content-iframe` (level 3), so manual frame switching is still required
 * for that step. Handling all three levels explicitly here is simpler.
 */
export class CreateQueryWebView {
  // The outer sidebar iframe for a VS Code WebviewView. Selected by the
  // "purpose=webviewView" query parameter present in all sidebar webview srcs.
  static readonly outerFrameSelector = 'iframe[src*="purpose=webviewView"]';
  static readonly activeFrameSelector = '#active-frame';
  static readonly contentFrameSelector = '#content-iframe';

  /** Navigate: outer sidebar iframe → #active-frame */
  async switchToFrame(timeout?: number): Promise<void> {
    await switchToFrame(
      [CreateQueryWebView.outerFrameSelector, CreateQueryWebView.activeFrameSelector],
      timeout
    );
  }

  /** Navigate: outer sidebar iframe → #active-frame → #content-iframe */
  async switchToContentFrame(timeout?: number): Promise<void> {
    await this.switchToFrame(timeout);
    await switchToFrame([CreateQueryWebView.contentFrameSelector], timeout);
  }

  async switchBack(): Promise<void> {
    await VSBrowser.instance.driver.switchTo().defaultContent();
  }

  async setHeapSize(value: string): Promise<void> {
    const input = await VSBrowser.instance.driver.findElement(
      By.css('.form-control.inputHeapSize')
    );
    await input.clear();
    await input.sendKeys(value);
  }

  async setLanguage(language: string): Promise<void> {
    const select = await VSBrowser.instance.driver.findElement(
      By.css('.custom-select.inputLanguage')
    );
    // Find the <option> whose text matches and select it
    const options = await select.findElements(By.css('option'));
    for (const option of options) {
      if ((await option.getText()) === language) {
        await option.click();
        return;
      }
    }
    throw new Error(`Language option "${language}" not found in dropdown`);
  }

  async clickConnect(): Promise<void> {
    const btn = await VSBrowser.instance.driver.findElement(
      By.css('button[type="submit"].btn-primary')
    );
    await btn.click();
  }
}
