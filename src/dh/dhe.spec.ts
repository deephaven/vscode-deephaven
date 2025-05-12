import { describe, it, expect, vi } from 'vitest';
import type { EnterpriseClient } from '@deephaven-enterprise/jsapi-types';
import {
  AUTH_CONFIG_CUSTOM_LOGIN_CLASS_SAML_AUTH,
  AUTH_CONFIG_PASSWORDS_ENABLED,
  AUTH_CONFIG_SAML_LOGIN_URL,
  AUTH_CONFIG_SAML_PROVIDER_NAME,
} from '../common';
import { getDheAuthConfig } from './dhe';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

describe('getDheAuthConfig', () => {
  const given = {
    samlLoginClass: [
      AUTH_CONFIG_CUSTOM_LOGIN_CLASS_SAML_AUTH,
      'mock.loginClass',
    ],
    samlProviderName: [AUTH_CONFIG_SAML_PROVIDER_NAME, 'mock.providerName'],
    samlLoginUrl: [AUTH_CONFIG_SAML_LOGIN_URL, 'mock.loginUrl'],
    passwordsEnabled: [AUTH_CONFIG_PASSWORDS_ENABLED, 'true'],
    passwordsDisabled: [AUTH_CONFIG_PASSWORDS_ENABLED, 'false'],
  } as const;

  const givenSamlConfig = {
    full: [given.samlLoginClass, given.samlProviderName, given.samlLoginUrl],
    partial: [given.samlLoginClass, given.samlProviderName],
  } as const;

  const expected = {
    samlConfigFull: {
      loginClass: given.samlLoginClass[1],
      providerName: given.samlProviderName[1],
      loginUrl: given.samlLoginUrl[1],
    },
  } as const;

  it.each([
    [
      'Undefined passwords config, Full SAML config',
      givenSamlConfig.full,
      {
        isPasswordEnabled: true,
        samlConfig: expected.samlConfigFull,
      },
    ],
    [
      'Undefined password config, Partial SAML config',
      givenSamlConfig.partial,
      {
        isPasswordEnabled: true,
        samlConfig: null,
      },
    ],
    [
      'Passwords enabled config, Full SAML config',
      [given.passwordsEnabled, ...givenSamlConfig.full],
      {
        isPasswordEnabled: true,
        samlConfig: expected.samlConfigFull,
      },
    ],
    [
      'Passwords disabled config, Full SAML config',
      [given.passwordsDisabled, ...givenSamlConfig.full],
      {
        isPasswordEnabled: false,
        samlConfig: expected.samlConfigFull,
      },
    ],
    [
      'Passwords disabled config, Partial SAML config',
      [given.passwordsDisabled, ...givenSamlConfig.partial],
      {
        isPasswordEnabled: false,
        samlConfig: null,
      },
    ],
  ])('should return auth config: %s', async (_label, given, expected) => {
    const getAuthConfigValues = vi.fn().mockResolvedValue(given);
    const dheClient = { getAuthConfigValues } as unknown as EnterpriseClient;

    const actual = await getDheAuthConfig(dheClient);
    expect(actual).toEqual(expected);
  });
});
