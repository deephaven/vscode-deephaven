import { By, Workbench, type WebElement } from 'vscode-extension-tester';

export class WorkbenchExtended extends Workbench {
  /**
   * Get the chat close button so we can hide Chat GPT.
   */
  async getChatCloseButton(): Promise<WebElement> {
    return this.findElement(
      By.xpath('.//a[@aria-label="Hide Secondary Side Bar (⌥⌘B)"]')
    );
  }
}
