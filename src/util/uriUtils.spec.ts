import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { parseUri, parseUrl, urlToDirectoryName } from './uriUtils';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('parseUri', () => {
  it.each([
    [
      'valid URI',
      'file:///path/to/file.txt',
      { success: true, value: vscode.Uri.parse('file:///path/to/file.txt') },
    ],
    ['null input', null, { success: true, value: null }],
    ['undefined input', undefined, { success: true, value: null }],
    [
      'invalid URI in strict mode',
      'invalid-no-scheme',
      { success: false, error: expect.any(String) },
    ],
  ])('should handle %s', (_label, input, expected) => {
    const result = parseUri(input, true);
    expect(result).toEqual(expected);

    if (input == null) {
      expect(vscode.Uri.parse).not.toHaveBeenCalled();
    } else {
      expect(vscode.Uri.parse).toHaveBeenCalledWith(input, true);
    }
  });
});

describe('parseUrl', () => {
  it.each([
    [
      'valid URL',
      'http://example.com:8080/path',
      { success: true, value: new URL('http://example.com:8080/path') },
    ],
    ['null input', null, { success: true, value: null }],
    ['undefined input', undefined, { success: true, value: null }],
    [
      'invalid URL',
      'not a valid url',
      { success: false, error: expect.any(String) },
    ],
  ])('should handle %s', (_label, input, expected) => {
    const result = parseUrl(input);
    expect(result).toEqual(expected);
  });
});

describe('urlToDirectoryName', () => {
  it.each([
    ['http://localhost:4000', 'localhost_4000'],
    ['https://localhost:5000', 'localhost_5000'],
    ['http://www.acme.com:6000', 'www_acme_com_6000'],
    ['https://www.acme.com:7000', 'www_acme_com_7000'],
  ])('should convert url to host_port string: %s, %s', (given, expected) => {
    expect(urlToDirectoryName(given)).toBe(expected);
  });
});
