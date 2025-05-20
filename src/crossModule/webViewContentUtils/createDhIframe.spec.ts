import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { WebviewApi } from 'vscode-webview';
import { createDhIframe } from './createDhIframe';
import { CONTENT_IFRAME_ID, DH_IFRAME_URL_META_KEY } from '../constants';
import {
  DH_POST_MSG,
  VSCODE_POST_MSG,
  type DhExternalThemeRequestMsg,
  type VscodeSetThemeRequestMsg,
} from '../msg';
import type { BaseThemeKey, ExternalThemeData } from '../types';
import { getExternalThemeData } from './getExternalThemeData';
import { getVscodeProperty } from './getVscodeProperty';
import { getIframeContentWindow } from './getIframeContentWindow';

// @vitest-environment jsdom

vi.mock('./getExternalThemeData');
vi.mock('./getIframeContentWindow');
vi.mock('./getVscodeProperty');

const mockBaseThemeKey = 'mock.baseThemeKey' as BaseThemeKey;
const mockIframeOrigin = 'https://mock-iframe.deephaven.io';
const mockTargetOrigin = 'mock.targetOrigin';

const mockIframeContentWindow = {
  postMessage: vi.fn(),
} as unknown as Window;

const mockVscodeApi = {
  postMessage: vi.fn(),
} as unknown as WebviewApi<unknown>;

const mockWindowEventSource = {
  postMessage: vi.fn(),
  window: {},
} as unknown as WindowProxy;

const mockNonWindowEventSource = {
  postMessage: vi.fn(),
} as unknown as MessageEventSource;

function mockGetExternalThemeData(
  baseThemeKey: BaseThemeKey
): ExternalThemeData {
  return {
    name: 'Mock Theme',
    baseThemeKey,
    cssVars: {},
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  vi.useFakeTimers();

  vi.mocked(getExternalThemeData).mockImplementation(mockGetExternalThemeData);
  vi.spyOn(window, 'addEventListener');

  vi.mocked(getIframeContentWindow).mockReturnValue(mockIframeContentWindow);
  vi.mocked(getVscodeProperty).mockResolvedValue(mockBaseThemeKey);
});

afterEach(() => {
  vi.useRealTimers();
});

function setIframeUrlMetaTag(): void {
  document.head.innerHTML = `<meta name="${DH_IFRAME_URL_META_KEY}" content="https://mock-iframe.deephaven.io" />`;
}

/**
 * Return last registered event handler for 'message' event.
 */
type MessageHandler<TData> = (event: Partial<MessageEvent<TData>>) => unknown;
function getLastMessageHandler<TData>(): MessageHandler<TData> {
  const messageCalls = vi
    .mocked(window.addEventListener<'message'>)
    .mock.calls.filter(([type]) => type === 'message');

  expect(messageCalls.length).toBeGreaterThan(0);

  return messageCalls.at(-1)![1] as MessageHandler<TData>;
}

it('should create an iframe with the correct attributes', () => {
  const newDateValue = new Date('2020-01-01T00:00:00Z');
  vi.setSystemTime(newDateValue);
  vi.spyOn(window, 'addEventListener');
  setIframeUrlMetaTag();

  createDhIframe(mockVscodeApi);

  const iframeEl = document.body.querySelector<HTMLIFrameElement>('iframe');

  expect(iframeEl).not.toBeNull();
  expect(iframeEl).toHaveProperty('id', CONTENT_IFRAME_ID);
  expect(iframeEl).toHaveProperty(
    'src',
    `${mockIframeOrigin}/?theme=external-theme&preloadTransparentTheme=true&cachebust=${newDateValue.getTime()}`
  );
});

it('should throw an error if the iframe URL meta tag is not found', () => {
  expect(() => createDhIframe(mockVscodeApi)).toThrow(
    `DH iframe URL not found in meta tag`
  );
});

it.each([
  {
    label: 'matching Window origin',
    origin: window.origin,
    source: mockWindowEventSource,
    expectBailImmediately: false,
    expectPostMessage: true,
  },
  {
    label: 'matching iframe origin',
    origin: mockIframeOrigin,
    source: mockWindowEventSource,
    expectBailImmediately: false,
    expectPostMessage: true,
  },
  {
    label: 'non-matching origin',
    origin: 'non-matching-origin',
    source: mockWindowEventSource,
    expectBailImmediately: true,
    expectPostMessage: false,
  },
  {
    label: 'non-Window source',
    origin: window.origin,
    source: mockNonWindowEventSource,
    expectBailImmediately: false,
    expectPostMessage: false,
  },
])(
  'should register a message handler that handles `DH_POST_MSG.requestExternalTheme` messages: $label',
  async ({ origin, source, expectBailImmediately, expectPostMessage }) => {
    setIframeUrlMetaTag();

    createDhIframe(mockVscodeApi);

    expect(window.addEventListener).toHaveBeenCalledTimes(1);

    const msgHandler = getLastMessageHandler<
      DhExternalThemeRequestMsg | VscodeSetThemeRequestMsg
    >();

    const data = {
      id: 'mock.id',
      message: DH_POST_MSG.requestExternalTheme,
    };

    await msgHandler({ data, origin, source });

    if (expectBailImmediately) {
      expect(getVscodeProperty).not.toHaveBeenCalled();
    } else {
      expect(getVscodeProperty).toHaveBeenCalledTimes(1);
      expect(getVscodeProperty).toHaveBeenCalledWith(
        mockVscodeApi,
        window,
        'baseThemeKey',
        mockIframeOrigin
      );
    }

    if (expectPostMessage) {
      expect(mockWindowEventSource.postMessage).toHaveBeenCalledTimes(1);
      expect(mockWindowEventSource.postMessage).toHaveBeenCalledWith(
        {
          id: data.id,
          payload: mockGetExternalThemeData(mockBaseThemeKey),
        },
        origin
      );
    } else {
      expect(mockWindowEventSource.postMessage).not.toHaveBeenCalled();
    }
  }
);

it.each([
  {
    label: 'matching Window origin',
    origin: window.origin,
    expectPostMessage: true,
  },
  {
    label: 'matching iframe origin',
    origin: mockIframeOrigin,
    expectPostMessage: true,
  },
  {
    label: 'non-matching origin',
    origin: 'non-matching-origin',
    expectPostMessage: false,
  },
])(
  'should handle `VSCODE_POST_MSG.requestSetTheme` messages: $label',
  async ({ origin, expectPostMessage }) => {
    setIframeUrlMetaTag();

    createDhIframe(mockVscodeApi);

    expect(window.addEventListener).toHaveBeenCalledTimes(1);

    const msgHandler = getLastMessageHandler<
      DhExternalThemeRequestMsg | VscodeSetThemeRequestMsg
    >();

    const data: VscodeSetThemeRequestMsg = {
      id: 'mock.id',
      message: VSCODE_POST_MSG.requestSetTheme,
      payload: mockBaseThemeKey,
      targetOrigin: mockTargetOrigin,
    };

    await msgHandler({ data, origin, source: mockWindowEventSource });

    if (expectPostMessage) {
      expect(mockIframeContentWindow.postMessage).toHaveBeenCalledTimes(1);
      expect(mockIframeContentWindow.postMessage).toHaveBeenCalledWith(
        {
          id: data.id,
          message: DH_POST_MSG.requestSetTheme,
          payload: mockGetExternalThemeData(mockBaseThemeKey),
        },
        mockTargetOrigin
      );
    } else {
      expect(mockIframeContentWindow.postMessage).not.toHaveBeenCalled();
    }
  }
);
