import { assertDefined } from './assertUtil';
import { CONTENT_IFRAME_ID } from './constants';
import { Logger } from './Logger';
import { MSG_DH } from './msg';

const logger = new Logger('webViewUtils');

/**
 * Create and append an iframe to a WebView that loads DH content. Expects meta
 * tags to provide the base theme key and the iframe URL (see `getWebViewHtml`
 * in the CJS `webViewUtils.ts` file).
 */
export function createDhIframe(): void {
  const baseThemeKey = document.querySelector<HTMLMetaElement>(
    'meta[name="dh-base-theme-key"]'
  )?.content;

  const iframeSrc = document.querySelector<HTMLMetaElement>(
    'meta[name="dh-iframe-url"]'
  )?.content;

  assertDefined(baseThemeKey, 'DH base theme key not found in meta tag');
  assertDefined(iframeSrc, 'DH iframe URL not found in meta tag');

  const resolver = getComputedStyle(document.documentElement);

  const sidebarBackground =
    resolver.getPropertyValue('--vscode-sideBar-background') || 'transparent';

  const iframeUrl = new URL(iframeSrc);

  iframeUrl.searchParams.append('theme', 'external-theme');
  iframeUrl.searchParams.append('preloadTransparentTheme', 'true');

  const iframeEl = document.createElement('iframe');
  iframeEl.id = CONTENT_IFRAME_ID;
  iframeEl.src = `${iframeUrl.href}&cachebust=${new Date().getTime()}`;

  window.addEventListener('message', ({ data, origin, source }) => {
    if (origin !== iframeUrl.origin) {
      return;
    }

    if (data.message === MSG_DH.externalThemeRequest) {
      logger.info('Sending theme to iframe');

      source?.postMessage(
        {
          id: data.id,
          payload: {
            name: 'Iframe Parent Theme',
            baseThemeKey,
            cssVars: {
              // eslint-disable-next-line @typescript-eslint/naming-convention
              '--dh-color-bg': sidebarBackground,
            },
          },
        },
        origin as any
      );
    }
  });

  document.body.appendChild(iframeEl);
}

/**
 * Get the `contentWindow` of the content iframe in the WebView.
 */
export function getIframeContentWindow(): Window {
  const maybeIframeEl = document.getElementById(CONTENT_IFRAME_ID);

  assertDefined(maybeIframeEl, 'iframe element');

  if (!(maybeIframeEl instanceof HTMLIFrameElement)) {
    throw new Error('Element is not an iframe');
  }

  assertDefined(maybeIframeEl.contentWindow, 'iframe content window');

  return maybeIframeEl.contentWindow;
}
