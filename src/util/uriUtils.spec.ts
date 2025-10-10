import { describe, expect, it, vi } from 'vitest';
import { urlToDirectoryName } from './uriUtils';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

describe('urlUtils', () => {
  it.each([
    ['http://localhost:4000', 'localhost_4000'],
    ['https://localhost:5000', 'localhost_5000'],
    ['http://www.acme.com:6000', 'www_acme_com_6000'],
    ['https://www.acme.com:7000', 'www_acme_com_7000'],
  ])('should convert url to host_port string: %s, %s', (given, expected) => {
    expect(urlToDirectoryName(given)).toBe(expected);
  });
});
