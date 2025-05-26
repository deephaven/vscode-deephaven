/**
 * Code in this module needs to be consumable from both the extension code (CJS)
 * and the webview content code (ESM). Avoid importing anything here from outside
 * of the `shared` folder to minimize the risk of breaking the builds.
 */

import type { WebviewApi } from 'vscode-webview';
import { assertDefined } from '../assertUtil';
import {
  CONTENT_IFRAME_ID,
  DH_IFRAME_URL_META_KEY,
  EXTERNAL_THEME_QUERY_PARAM,
  PRELOAD_TRANSPARENT_THEME_QUERY_PARAM,
  VSCODE_PROPERTY_NAME,
} from '../constants';
import {
  DH_POST_MSG,
  isWindowProxy,
  VSCODE_POST_MSG,
  type DhExternalThemeRequestMsg,
  type DhSetThemeRequestMsg,
  type VscodeSetThemeRequestMsg,
} from '../msg';
import { Logger } from '../Logger';
import { getVscodeProperty } from './getVscodeProperty';
import { getExternalThemeData } from './getExternalThemeData';
import { getIframeContentWindow } from './getIframeContentWindow';

const logger = new Logger('createDhIframe');

/**
 * Create and append an iframe to a WebView that loads DH content. Expects meta
 * tags to provide the iframe URL (see `getWebViewHtml` in the `webViewUtils.ts`
 * file).
 * @param vscode The VS Code Webview API.
 */
export function createDhIframe(vscode: WebviewApi<unknown>): void {
  const iframeSrc = document.querySelector<HTMLMetaElement>(
    `meta[name="${DH_IFRAME_URL_META_KEY}"]`
  )?.content;

  assertDefined(iframeSrc, 'DH iframe URL not found in meta tag');

  const dhIframeUrl = new URL(iframeSrc);
  dhIframeUrl.searchParams.append(...EXTERNAL_THEME_QUERY_PARAM);
  dhIframeUrl.searchParams.append(...PRELOAD_TRANSPARENT_THEME_QUERY_PARAM);

  const iframeEl = document.createElement('iframe');
  iframeEl.id = CONTENT_IFRAME_ID;
  iframeEl.src = `${dhIframeUrl.href}&cachebust=${new Date().getTime()}`;

  window.addEventListener(
    'message',
    async ({
      data,
      origin,
      source,
    }: MessageEvent<DhExternalThemeRequestMsg | VscodeSetThemeRequestMsg>) => {
      if (origin !== window.origin && origin !== dhIframeUrl.origin) {
        return;
      }

      // DH requested theme from VS Code
      if (data.message === DH_POST_MSG.requestExternalTheme) {
        logger.info('DH requested external theme');

        const baseThemeKey = await getVscodeProperty(
          vscode,
          window,
          VSCODE_PROPERTY_NAME.baseThemeKey,
          dhIframeUrl.origin
        );

        const externalThemeData = getExternalThemeData(baseThemeKey);

        if (isWindowProxy(source)) {
          source.postMessage(
            {
              id: data.id,
              payload: externalThemeData,
            },
            origin
          );
        }

        return;
      }

      // VS Code requested to set theme
      if (data.message === VSCODE_POST_MSG.requestSetTheme) {
        logger.info('VS Code requested to set theme');

        const { id, payload, targetOrigin } = data;

        const msg: DhSetThemeRequestMsg = {
          id,
          message: DH_POST_MSG.requestSetTheme,
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
