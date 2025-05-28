export const CONTENT_IFRAME_ID = 'content-iframe' as const;
export const DH_IFRAME_URL_META_KEY = 'dh-iframe-url' as const;
export const GET_PROPERTY_TIMEOUT_MS = 3000 as const;

/**
 * Query params
 */

export const EXTERNAL_THEME_QUERY_PARAM = ['theme', 'external-theme'] as const;

export const PRELOAD_TRANSPARENT_THEME_QUERY_PARAM = [
  'preloadTransparentTheme',
  'true',
] as const;

export const VSCODE_PROPERTY_NAME = {
  baseThemeKey: 'baseThemeKey',
} as const;
