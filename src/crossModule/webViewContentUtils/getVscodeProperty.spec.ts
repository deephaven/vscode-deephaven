import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import { getVscodeProperty } from './getVscodeProperty';
import type { WebviewApi } from 'vscode-webview';
import { getLastMessageHandler } from '../../testUtils';
import type { BaseThemeKey } from '../types';
import { VSCODE_POST_MSG, type VscodeGetPropertyResponseMsg } from '../msg';

// @vitest-environment jsdom

const mockVscode = {
  postMessage: vi.fn(),
} as unknown as WebviewApi<unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'addEventListener');
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it.each([
  {
    label: 'Response from webview origin',
    message: VSCODE_POST_MSG.getVscodePropertyResponse,
    origin: window.origin,
    shouldRespond: true,
  },
  {
    label: 'Unrecognized message from webview origin',
    message:
      'some-other-message' as typeof VSCODE_POST_MSG.getVscodePropertyResponse,
    origin: window.origin,
    shouldRespond: false,
  },
  {
    label: 'Unexpected origin',
    message: VSCODE_POST_MSG.getVscodePropertyResponse,
    origin: 'some-other-origin',
    shouldRespond: false,
  },
])(
  'should request a named property from the VS Code API: $label',
  async ({ message, origin, shouldRespond }) => {
    const propertyName = 'baseThemeKey';
    const dhIframeOrigin = 'http://dh-iframe-origin.com';
    const baseThemeKeyResponse = 'mock.baseThemeKey' as BaseThemeKey;

    const promise = getVscodeProperty(
      mockVscode,
      window,
      propertyName,
      dhIframeOrigin
    );

    expect(mockVscode.postMessage).toHaveBeenCalledWith({
      data: {
        id: expect.any(String),
        message: VSCODE_POST_MSG.getVscodeProperty,
        payload: propertyName,
      },
      origin: dhIframeOrigin,
    });

    expect(window.addEventListener).toHaveBeenCalledOnce();
    expect(window.addEventListener).toHaveBeenCalledWith(
      'message',
      expect.any(Function)
    );

    const messageHandler =
      getLastMessageHandler<
        VscodeGetPropertyResponseMsg<'baseThemeKey', BaseThemeKey>
      >();

    const data: VscodeGetPropertyResponseMsg<'baseThemeKey', BaseThemeKey> = {
      id: 'mock.id',
      message,
      payload: {
        name: propertyName,
        value: baseThemeKeyResponse,
      },
    };

    messageHandler({ data, origin });

    vi.runOnlyPendingTimers();

    if (shouldRespond) {
      await expect(promise).resolves.toEqual(baseThemeKeyResponse);
    } else {
      expect(promise).rejects.toThrow('Timeout waiting for property response');
    }
  }
);
