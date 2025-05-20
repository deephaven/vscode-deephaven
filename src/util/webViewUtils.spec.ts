import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createGetPropertyResponseMsg,
  getWebViewContentRootUri,
  getWebViewHtml,
} from './webViewUtils';
import { VIEW_ID_PREFIX, type ViewID } from '../common';
import { mockT } from '../crossModule/testUtils';
import { uniqueId } from './idUtils';
import type { UniqueID } from '../types';
import {
  VSCODE_POST_MSG,
  type BaseThemeKey,
  type VscodePropertyName,
} from '../crossModule';
import { getDHThemeKey } from './uiUtils';

vi.mock('vscode');
vi.mock('./idUtils');
vi.mock('./uiUtils');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(uniqueId).mockReturnValue('mock.uniqueId' as UniqueID);
});

const mockExtensionUri = {
  path: 'mock.extensionUri',
  toString: function () {
    return this.path;
  },
} as vscode.Uri;
const mockViewId = `${VIEW_ID_PREFIX}mockViewId` as ViewID;
const mockWebView = mockT<vscode.Webview>({
  cspSource: 'mock.cspSource',
  asWebviewUri: vi.fn(),
});

describe('createGetPropertyResponseMsg', () => {
  it('should return the correct message', () => {
    const id = 'mock.id';
    const name = 'mock.name' as VscodePropertyName;
    const value = 'mock.themeKey' as BaseThemeKey;

    vi.mocked(getDHThemeKey).mockReturnValue(value);

    const result = createGetPropertyResponseMsg(id, name);

    expect(result).toEqual({
      id,
      message: VSCODE_POST_MSG.getVscodePropertyResponse,
      payload: {
        name,
        value,
      },
    });
  });
});

describe('getWebViewContentRootUri', () => {
  it('should return the correct Uri', () => {
    const result = getWebViewContentRootUri(mockExtensionUri, mockViewId);

    expect(vscode.Uri.joinPath).toHaveBeenCalledWith(
      mockExtensionUri,
      'out',
      'webViews',
      mockViewId.replace(VIEW_ID_PREFIX, '')
    );

    const expected = vi.mocked(vscode.Uri.joinPath).mock.results[0].value;

    expect(result).toBe(expected);
  });
});

describe('getWebViewHtml', () => {
  beforeEach(() => {
    vi.mocked(mockWebView.asWebviewUri).mockImplementation(uri =>
      vscode.Uri.parse(`mockwebview://${uri}`)
    );
  });

  it('should return the correct HTML', () => {
    expect(
      getWebViewHtml({
        extensionUri: mockExtensionUri,
        webView: mockWebView,
        viewId: mockViewId,
        iframeUrl: new URL('https://example.com'),
        scriptFileName: 'script.js',
        stylesFileName: 'styles.css',
      })
    ).toMatchSnapshot();
  });
});
