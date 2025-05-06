import { assertDefined } from './assertUtil';
import { CONTENT_IFRAME_ID } from './constants';
import { Logger } from './Logger';
import {
  THEME_POST_MSG_DH,
  THEME_POST_MSG_VSCODE,
  type ExternalThemeData,
  type SetThemeRequestMsgDh,
  type ThemeMsg,
} from './msg';
import type { BaseThemeKey } from './types';

const logger = new Logger('webViewUtils');

/**
 * Create and append an iframe to a WebView that loads DH content. Expects meta
 * tags to provide the base theme key and the iframe URL (see `getWebViewHtml`
 * in the CJS `webViewUtils.ts` file).
 */
export function createDhIframe(): void {
  const baseThemeKey = document.querySelector<HTMLMetaElement>(
    'meta[name="dh-base-theme-key"]'
  )?.content as BaseThemeKey | undefined;

  const iframeSrc = document.querySelector<HTMLMetaElement>(
    'meta[name="dh-iframe-url"]'
  )?.content;

  assertDefined(baseThemeKey, 'DH base theme key not found in meta tag');
  assertDefined(iframeSrc, 'DH iframe URL not found in meta tag');

  const resolver = getComputedStyle(document.documentElement);
  const getExternalThemeData = (
    baseThemeKey: BaseThemeKey
  ): ExternalThemeData => {
    const sidebarBackground =
      resolver.getPropertyValue('--vscode-sideBar-background') || 'transparent';

    const cssVars = {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      '--dh-color-bg': sidebarBackground,
    };

    return {
      name: 'Iframe Parent Theme',
      baseThemeKey,
      cssVars,
    };
  };

  const iframeUrl = new URL(iframeSrc);

  iframeUrl.searchParams.append('theme', 'external-theme');
  iframeUrl.searchParams.append('preloadTransparentTheme', 'true');

  const iframeEl = document.createElement('iframe');
  iframeEl.id = CONTENT_IFRAME_ID;
  iframeEl.src = `${iframeUrl.href}&cachebust=${new Date().getTime()}`;

  window.addEventListener(
    'message',
    ({ data, origin, source }: MessageEvent<ThemeMsg>) => {
      if (origin !== window.origin && origin !== iframeUrl.origin) {
        return;
      }

      if (data.message === THEME_POST_MSG_DH.requestExternalTheme) {
        logger.info('DH requested external theme');

        source?.postMessage(
          {
            id: data.id,
            payload: getExternalThemeData(baseThemeKey),
          },
          origin as any
        );

        return;
      }

      if (data.message === THEME_POST_MSG_VSCODE.requestSetTheme) {
        logger.info('VS Code requested to set theme');

        const { id, payload, targetOrigin } = data;

        const msg: SetThemeRequestMsgDh = {
          id,
          message: THEME_POST_MSG_DH.requestSetTheme,
          payload: getExternalThemeData(payload),
        };

        logger.info('Sending message to Deephaven:', JSON.stringify(msg));
        const iframeWindow = getIframeContentWindow();
        iframeWindow.postMessage(msg, targetOrigin);

        return;
      }
    }
  );

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
