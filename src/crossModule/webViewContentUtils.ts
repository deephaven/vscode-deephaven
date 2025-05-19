/**
 * Code in this module needs to be consumable from both the extension code (CJS)
 * and the webview content code (ESM). Avoid importing anything here from outside
 * of the `crossModule` folder to minimize the risk of breaking the builds.
 */

import type { WebviewApi } from 'vscode-webview';
import { assertDefined } from './assertUtil';
import {
  CONTENT_IFRAME_ID,
  DH_IFRAME_URL_META_KEY,
  EXTERNAL_THEME_QUERY_PARAM,
  GET_PROPERTY_TIMEOUT_MS,
  PRELOAD_TRANSPARENT_THEME_QUERY_PARAM,
} from './constants';
import { Logger } from './Logger';
import {
  DH_POST_MSG,
  VSCODE_POST_MSG,
  type DhExternalThemeRequestMsg,
  type DhSetThemeRequestMsg,
  type VscodeGetPropertyMsg,
  type VscodeGetPropertyResponseMsg,
  type VscodePropertyName,
  type VscodeSetThemeRequestMsg,
} from './msg';
import type { BaseThemeKey, ExternalThemeData } from './types';

const logger = new Logger('webViewUtils');

/**
 * Create and append an iframe to a WebView that loads DH content. Expects meta
 * tags to provide the iframe URL (see `getWebViewHtml` the CJS `webViewUtils.ts`
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
          'baseThemeKey',
          dhIframeUrl.origin
        );

        const externalThemeData = getExternalThemeData(baseThemeKey);

        source?.postMessage(
          {
            id: data.id,
            payload: externalThemeData,
          },
          origin as any
        );

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

/**
 * Request a named property from the VS Code API from a WebView. This uses
 * `postMessage` apis and requires `vscode` to call the `webview.postMessage`
 * method with the appropriate response message.
 * @param vscode The VS Code Webview API.
 * @param webviewWindow The window of the WebView.
 * @param propertyName The name of the property to request.
 * @param dhIframeOrigin The origin of the DH iframe.
 * @returns A promise that resolves with the value of the property.
 */
export async function getVscodeProperty(
  vscode: WebviewApi<unknown>,
  webviewWindow: Window,
  propertyName: VscodePropertyName,
  dhIframeOrigin: string
): Promise<BaseThemeKey> {
  return new Promise((resolve, reject) => {
    // Listen for `webview.postMessage` calls from VS Code and resolve Promise
    // if any response match the `propertyName` requested.
    webviewWindow.addEventListener(
      'message',
      function onMessage({
        data,
        origin,
      }: MessageEvent<
        VscodeGetPropertyResponseMsg<'baseThemeKey', BaseThemeKey>
      >): void {
        if (origin !== webviewWindow.origin) {
          return;
        }

        if (
          data.message === VSCODE_POST_MSG.getVscodePropertyResponse &&
          data.payload.name === propertyName
        ) {
          webviewWindow.removeEventListener('message', onMessage);
          resolve(data.payload.value);
        }
      }
    );

    setTimeout(() => {
      reject(new Error('Timeout waiting for property response'));
    }, GET_PROPERTY_TIMEOUT_MS);

    // Send a request to vscode from the webview
    const data: VscodeGetPropertyMsg = {
      // using native browser api to avoid `nanoid` having to be bundled in the
      // webView build
      id: crypto.randomUUID(),
      message: VSCODE_POST_MSG.getVscodeProperty,
      payload: propertyName,
    };

    vscode.postMessage({ data, origin: dhIframeOrigin });
  });
}

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
