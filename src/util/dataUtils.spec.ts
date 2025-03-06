import { describe, it, expect } from 'vitest';
import { parseSamlScopes } from './dataUtils';
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
