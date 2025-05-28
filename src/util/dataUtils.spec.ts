import { describe, it, expect } from 'vitest';
import type { dh as DhType } from '@deephaven/jsapi-types';
import { parseSamlScopes, serializeRefreshToken } from './dataUtils';
import {
  DH_SAML_LOGIN_URL_SCOPE_KEY,
  DH_SAML_SERVER_URL_SCOPE_KEY,
} from '../common';

describe('parseSamlScopes', () => {
  it('should return null if no SAML scopes are found', () => {
    const scopes = ['scope1', 'scope2'];
    const result = parseSamlScopes(scopes);
    expect(result).toBeNull();
  });

  it('should return the SAML scopes if found', () => {
    const scopes = [
      `${DH_SAML_SERVER_URL_SCOPE_KEY}:https://someserver-url.com`,
      `${DH_SAML_LOGIN_URL_SCOPE_KEY}:https://somelogin-url.com`,
    ];
    const result = parseSamlScopes(scopes);
    expect(result).toEqual({
      serverUrl: 'https://someserver-url.com',
      samlLoginUrl: 'https://somelogin-url.com',
    });
  });
});

describe('serializeRefreshToken', () => {
  const mockRefreshToken: DhType.RefreshToken = {
    get bytes() {
      return 'mockBytes';
    },
    get expiry() {
      return 1234567890;
    },
  };

  it.each([null, mockRefreshToken])(
    'should convert a refresh token to a serializable format',
    refreshToken => {
      const result = serializeRefreshToken(refreshToken);

      if (refreshToken == null) {
        expect(result).toBeNull();
      } else {
        expect(result).toEqual({
          bytes: mockRefreshToken.bytes,
          expiry: mockRefreshToken.expiry,
        });
      }
    }
  );
});
