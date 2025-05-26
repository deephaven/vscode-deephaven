/**
 * Code in this module needs to be consumable from both the extension code (CJS)
 * and the webview content code (ESM). Avoid importing anything here from outside
 * of the `shared` folder to minimize the risk of breaking the builds.
 */

export * from './createDhIframe';
export * from './getExternalThemeData';
export * from './getIframeContentWindow';
export * from './getVscodeProperty';
