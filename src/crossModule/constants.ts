/**
 * Constants that need to be consumable from both the extension code (CJS) and
 * the webview content code (ESM). Avoid importing anything from other files
 * to minimize the risk of breaking the builds.
 */

export const CONTENT_IFRAME_ID = 'content-iframe';
