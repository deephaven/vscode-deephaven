# Plan: E2E Support for "Create Connection" Webview Form

## Background

The VS Code extension has two worker-creation flows for Enterprise (Core+) servers:

| Flow                   | Trigger                                                          | Current e2e support |
| ---------------------- | ---------------------------------------------------------------- | ------------------- |
| Auto-connect           | Server does **not** have `createQueryIframe` feature             | ✅ Implemented      |
| Create Connection form | Server has `createQueryIframe: true` in `/iriside/features.json` | ❌ Not implemented  |

### How the extension decides which flow to use

`DheService.createWorker()` in `src/services/DheService.ts` fetches
`/iriside/features.json` from the server. If the response contains
`features.createQueryIframe === true`, it calls `_interactiveConsoleQueryFactory()`
which opens the "Create Connection" webview. Otherwise it calls
`createInteractiveConsoleQuery()` using `experimentalWorkerConfig` from VS Code
settings.

The two flows are **mutually exclusive**. Including `experimentalWorkerConfig` in
VS Code settings for a `createQueryIframe` server is harmless — the extension
ignores it.

### The "Create Connection" panel

`CreateQueryViewProvider` (`src/providers/CreateQueryViewProvider.ts`) implements
`vscode.WebviewViewProvider`. The panel:

- Lives in the **"Deephaven Detail" activity bar container**
  (`vscode-deephaven_viewContainer_detail`), not an editor tab
- View ID: `vscode-deephaven.view.createQuery`, name: `"Create Connection"`
- Iframe structure (same three-level nesting as all other DH webviews):
  1. Outer VS Code webview `<iframe>` (in the sidebar DOM) — selector TBD
  2. `<iframe id="active-frame">` — VS Code's internal webview wrapper, same as
     `WebViewExtended.activeFrameSelector`
  3. `<iframe id="content-iframe">` — the DH server UI with the actual form,
     created by `createDhIframe.ts` using `CONTENT_IFRAME_ID = 'content-iframe'`,
     pointing to `DHE_CREATE_QUERY_URL_PATH`

### Connection sequence for `createQueryIframe` servers

```
click server node
  → auth InputBox (SAML/Basic selector, then username, then password)
  → "Create Connection" sidebar form appears
  → test fills Heap Size + Language, clicks Connect
  → DH creates worker
  → "Created Deephaven session: …" notification
```

Auth comes **before** the form. The form appears **between** the auth InputBox
handling and the notification wait in `waitForServerConnection()`.

### Known selectors inside `#content-iframe` (the DH web UI form)

| Field       | Selector                        | Action                     |
| ----------- | ------------------------------- | -------------------------- |
| Heap Size   | `.form-control.inputHeapSize`   | Clear + type `"0.5"`       |
| Language    | `.custom-select.inputLanguage`  | `select` element, set to `"Python"` |
| Connect btn | `.btn-primary` (`type="submit"`)| Click                      |

### Known selectors for the outer sidebar iframe

**Needs empirical discovery.** Candidates (in order of likelihood):

1. `[data-view-id="vscode-deephaven.view.createQuery"] iframe`
2. `.pane[aria-label="CREATE CONNECTION"] iframe` or `.pane[aria-label="Create Connection"] iframe`

If neither works, add a temporary diagnostic log after auth completes:
```typescript
const iframes = await VSBrowser.instance.driver.findElements(By.css('iframe'));
for (const f of iframes) {
  const id = await f.getAttribute('id');
  const cls = await f.getAttribute('class');
  console.log('iframe:', id, cls);
}
```
Then check the console output to identify the correct selector and update
`CreateQueryWebView.switchToFrame()`.

---

## Changes Required

### 1. `scripts/e2e.sh`

Add one line to export the server URL to the Mocha test process (place it
alongside the existing env var usage before the `node e2e-testing/...` call):

```bash
export DH_SERVER_URL="${SERVER_URL}"
```

No changes needed to `scripts/generate-test-settings.mjs`.

---

### 2. New page object `e2e-testing/src/pageObjects/CreateQueryWebView.ts`

```typescript
import { By, VSBrowser } from 'vscode-extension-tester';
import { switchToFrame } from '../util';

/**
 * Page object for the "Create Connection" WebviewView panel that appears in the
 * "Deephaven Detail" sidebar when connecting to a server with the
 * `createQueryIframe` feature. Handles three levels of iframe nesting:
 *   1. Outer VS Code webview iframe (in the sidebar DOM)
 *   2. `#active-frame` — VS Code's internal webview wrapper
 *   3. `#content-iframe` — the DH server UI with the form
 */
export class CreateQueryWebView {
  static readonly VIEW_ID = 'vscode-deephaven.view.createQuery';
  // Same intermediate frame used by WebViewExtended — VS Code's internal webview wrapper
  static readonly ACTIVE_FRAME_SELECTOR = '#active-frame';
  static readonly CONTENT_FRAME_SELECTOR = '#content-iframe';

  // NOTE: This selector needs empirical verification. See plan.md "Known
  // selectors for the outer sidebar iframe" for candidates and discovery steps.
  static readonly OUTER_FRAME_SELECTOR =
    `[data-view-id="${CreateQueryWebView.VIEW_ID}"] iframe`;

  /** Navigate: outer sidebar iframe → #active-frame */
  async switchToFrame(): Promise<void> {
    await switchToFrame([
      CreateQueryWebView.OUTER_FRAME_SELECTOR,
      CreateQueryWebView.ACTIVE_FRAME_SELECTOR,
    ]);
  }

  /** Navigate: outer sidebar iframe → #active-frame → #content-iframe */
  async switchToContentFrame(): Promise<void> {
    await this.switchToFrame();
    await switchToFrame([CreateQueryWebView.CONTENT_FRAME_SELECTOR]);
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
```

---

### 3. `e2e-testing/src/pageObjects/index.ts`

Add one export line:

```typescript
export * from './CreateQueryWebView';
```

---

### 4. `e2e-testing/src/util/testUtils.ts`

#### 4a. Add `checkCreateQueryIframe()` (private, not exported)

Add near the top of the file with the other utility functions:

```typescript
/**
 * Check if the server at the given URL requires the "Create Connection"
 * webview form to create a worker. Mirrors the getDheFeatures() check in
 * src/dh/dhe.ts using the same endpoint and response validation.
 */
async function checkCreateQueryIframe(serverUrl: string): Promise<boolean> {
  try {
    const res = await fetch(new URL('/iriside/features.json', serverUrl));
    if (!res.ok || res.headers.get('content-type') !== 'application/json') {
      return false;
    }
    const json = await res.json();
    return json?.features?.createQueryIframe === true;
  } catch {
    return false;
  }
}
```

#### 4b. Add `handleCreateQueryForm()` (private, not exported)

> **Note:** Do NOT import `CreateQueryWebView` into `testUtils.ts`. `pageObjects`
> already imports `switchToFrame` from `'../util'`, which re-exports `testUtils.ts`,
> so importing back would create a circular dependency. Use `switchToFrame`,
> `VSBrowser`, and `By` directly — all already imported in `testUtils.ts`.

```typescript
/**
 * Fill in and submit the "Create Connection" webview form that appears for
 * servers with the `createQueryIframe` feature. Sets Heap Size to 0.5 GB and
 * Language to Python, then clicks Connect.
 */
async function handleCreateQueryForm(): Promise<void> {
  const { driver } = VSBrowser.instance;

  // Navigate: outer sidebar iframe → #active-frame → #content-iframe
  await switchToFrame([
    '[data-view-id="vscode-deephaven.view.createQuery"] iframe', // see Open Item
    '#active-frame',
    '#content-iframe',
  ]);

  const heapInput = await driver.findElement(
    By.css('.form-control.inputHeapSize')
  );
  await heapInput.clear();
  await heapInput.sendKeys('0.5');

  const langSelect = await driver.findElement(
    By.css('.custom-select.inputLanguage')
  );
  for (const option of await langSelect.findElements(By.css('option'))) {
    if ((await option.getText()) === 'Python') {
      await option.click();
      break;
    }
  }

  const connectBtn = await driver.findElement(
    By.css('button[type="submit"].btn-primary')
  );
  await connectBtn.click();

  await driver.switchTo().defaultContent();
}
```

#### 4c. Update `waitForServerConnection()`

Insert the form-handling block between the auth InputBox section and the
notification wait (replace the existing notification wait lines):

```typescript
  // ... existing auth InputBox handling unchanged above this point ...

  // Handle "Create Connection" form for servers with the createQueryIframe feature
  const serverUrl = process.env.DH_SERVER_URL;
  if (serverUrl != null && (await checkCreateQueryIframe(serverUrl))) {
    await handleCreateQueryForm();
  }

  // Wait for connection to be active
  const notification = await VSBrowser.instance.driver.wait<Notification>(
    getServerConnectedNotification
  );
  await notification?.dismiss();
```

---

## File Summary

| File                                                    | Change                                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `scripts/e2e.sh`                                        | Add `export DH_SERVER_URL="${SERVER_URL}"`                                                              |
| `e2e-testing/src/pageObjects/CreateQueryWebView.ts`     | New file — sidebar WebviewView iframe navigation + form interactions                                    |
| `e2e-testing/src/pageObjects/index.ts`                  | Add `export * from './CreateQueryWebView'`                                                              |
| `e2e-testing/src/util/testUtils.ts`                     | Add `checkCreateQueryIframe()`, `handleCreateQueryForm()`; update `waitForServerConnection()` |

`scripts/generate-test-settings.mjs`, existing specs, and all other utilities
require no changes.

---

## Open Item: Outer Sidebar Iframe Selector

`CreateQueryWebView.OUTER_FRAME_SELECTOR` is the one thing that cannot be
confirmed from source alone. After implementing, run against a `createQueryIframe`
server and check whether the selector resolves. If not, use the diagnostic log
described above to find the correct selector and update the constant.
