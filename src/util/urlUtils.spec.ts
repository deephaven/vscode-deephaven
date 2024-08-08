import { describe, expect, it } from 'vitest';
import { urlToDirectoryName } from './urlUtils';

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
