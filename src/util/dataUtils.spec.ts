import { describe, it, expect, vi } from 'vitest';
import type { dh as DhType } from '@deephaven/jsapi-types';
import { parseSamlScopes, serializeRefreshToken } from './dataUtils';
import {
  DH_SAML_LOGIN_URL_SCOPE_KEY,
  DH_SAML_SERVER_URL_SCOPE_KEY,
} from '../common';

vi.mock('vscode');

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
  const mockRefreshToken: DhType.RefreshToken & {
    // TODO: Once the types changes made by DH-17975 have been published, we
    // should be able to update @deephaven-enterprise/jsapi-types and use
    // the proper RefreshToken type there and get rid of this augmentation.
    authenticatedUser?: string;
    effectiveUser?: string;
  } = {
    get authenticatedUser() {
      return 'mockAuthenticatedUser';
    },
    get bytes() {
      return 'mockBytes';
    },
    get effectiveUser() {
      return 'mockEffectiveUser';
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
          authenticatedUser: mockRefreshToken.authenticatedUser,
          bytes: mockRefreshToken.bytes,
          effectiveUser: mockRefreshToken.effectiveUser,
          expiry: mockRefreshToken.expiry,
        });
      }
    }
  );
});
