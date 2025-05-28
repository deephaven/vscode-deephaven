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
