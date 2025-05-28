import type { WebviewApi } from 'vscode-webview';
import { GET_PROPERTY_TIMEOUT_MS } from '../constants';
import {
  VSCODE_POST_MSG,
  type VscodeGetPropertyMsg,
  type VscodeGetPropertyResponseMsg,
  type VscodePropertyName,
} from '../msg';
import type { BaseThemeKey } from '../types';

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
  // Note that it would be nice to use `Promise.withResolvers` here but current
  // TypeScript configuration is not aware of this api even though it exists at
  // runtime. Not worth the config update just to use this, but if we ever
  // update the config we should consider using it.
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
