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
    missingLoginUrl: [given.samlLoginClass, given.samlProviderName],
    missingName: [given.samlLoginClass, '', given.samlLoginUrl],
  } as const;

  const expected = {
    samlConfigFull: {
      loginClass: given.samlLoginClass[1],
      providerName: given.samlProviderName[1],
      loginUrl: given.samlLoginUrl[1],
    },
    samlConfigDefaultName: {
      loginClass: given.samlLoginClass[1],
      providerName: 'SAML',
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
      false,
    ],
    [
      'Undefined password config, missing name config',
      givenSamlConfig.missingName,
      {
        isPasswordEnabled: true,
        samlConfig: expected.samlConfigDefaultName,
      },
      false,
    ],
    [
      'Undefined password config, missing login URL config',
      givenSamlConfig.missingLoginUrl,
      {
        isPasswordEnabled: true,
        samlConfig: null,
      },
      true,
    ],
    [
      'Passwords enabled config, Full SAML config',
      [given.passwordsEnabled, ...givenSamlConfig.full],
      {
        isPasswordEnabled: true,
        samlConfig: expected.samlConfigFull,
      },
      false,
    ],
    [
      'Passwords disabled config, Full SAML config',
      [given.passwordsDisabled, ...givenSamlConfig.full],
      {
        isPasswordEnabled: false,
        samlConfig: expected.samlConfigFull,
      },
      false,
    ],
    [
      'Passwords disabled config, missing name config',
      [given.passwordsDisabled, ...givenSamlConfig.missingName],
      {
        isPasswordEnabled: false,
        samlConfig: expected.samlConfigDefaultName,
      },
      false,
    ],
    [
      'Passwords disabled config, missing login URL config',
      [given.passwordsDisabled, ...givenSamlConfig.missingLoginUrl],
      {
        isPasswordEnabled: false,
        samlConfig: null,
      },
      true,
    ],
  ])(
    'should return auth config: %s',
    async (_label, given, expected, shouldLogError) => {
      const getAuthConfigValues = vi.fn().mockResolvedValue(given);
      const dheClient = { getAuthConfigValues } as unknown as EnterpriseClient;

      const error = vi.fn();
      const actual = await getDheAuthConfig(dheClient, { error });
      expect(actual).toEqual(expected);

      if (shouldLogError) {
        expect(error).toHaveBeenCalledWith(
          `SAML authentication is enabled but 'authentication.client.samlauth.login.url' is not set. Check your Deephaven server settings.`
        );
      } else {
        expect(error).not.toHaveBeenCalled();
      }
    }
  );
});
