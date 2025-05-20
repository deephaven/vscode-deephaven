/**
 * Code in this module needs to be consumable from both the extension code (CJS)
 * and the webview content code (ESM). Avoid importing anything here from outside
 * of the `crossModule` folder to minimize the risk of breaking the builds.
 */

import type { BaseThemeKey, ExternalThemeData } from '../types';

/**
 * Get external theme data to send to DH.
 * @param baseThemeKey The base theme key to use.
 * @returns The external theme data.
 */
export function getExternalThemeData(
  baseThemeKey: BaseThemeKey
): ExternalThemeData {
  const resolver = getComputedStyle(document.documentElement);

  // Get VS Code's current theme colors
  const sidebarBackground =
    resolver.getPropertyValue('--vscode-sideBar-background') || 'transparent';

  const cssVars = {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    '--dh-color-bg': sidebarBackground,
  };

  return {
    name: 'Iframe External Theme',
    baseThemeKey,
    cssVars,
  };
}
