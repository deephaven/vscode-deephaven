import type { dh as DhcType } from '@deephaven/jsapi-types';
import {
  DH_SAML_LOGIN_URL_SCOPE_KEY,
  DH_SAML_SERVER_URL_SCOPE_KEY,
} from '../common';
import type {
  AuthConfig,
  AuthFlow,
  MultiAuthConfig,
  NoAuthConfig,
  NonEmptyArray,
  ParseSuccessOrError,
  ParseSuccess,
  SingleAuthConfig,
} from '../types';
import type { SerializableRefreshToken } from '../shared';

/**
 * Returns a date string formatted for use in a file path.
 * The format is YYYYMMDDTHHMMSSZ.
 * @param dateOrIsoString A Date object or an ISO 8601 date string.
 * @returns A string formatted for use in a file path.
 */
export function getFilePathDateToken(
  dateOrIsoString: Date | string = new Date()
): string {
  if (dateOrIsoString instanceof Date) {
    dateOrIsoString = dateOrIsoString.toISOString();
  }

  return `${dateOrIsoString.substring(0, 19).replace(/[:-]/g, '')}Z`;
}

/**
 * Type guard to determine if an object has a property.
 * @param obj The object to check.
 * @param prop The property to check for.
 * @returns true if the property exists, false otherwise.
 */
export function hasProperty<TProp extends string>(
  obj: unknown,
  prop: TProp
): obj is Record<TProp, unknown> {
  return obj != null && typeof obj === 'object' && prop in obj;
}

/**
 * Get the authentication flow based on the authConfig.
 * @param authConfig The authConfig to check.
 * @returns The authentication flow
 */
export function getAuthFlow(authConfig: SingleAuthConfig): AuthFlow {
  if (authConfig.isPasswordEnabled) {
    return {
      type: 'password',
    };
  }

  return {
    type: 'saml',
    config: authConfig.samlConfig,
  };
}

/**
 * Type guard to check if the authConfig is a MultiAuthConfig.
 * @param authConfig The authConfig to check.
 * @returns true if the authConfig is a MultiAuthConfig, false otherwise
 */
export function isMultiAuthConfig(
  authConfig: AuthConfig
): authConfig is MultiAuthConfig {
  return authConfig.isPasswordEnabled && authConfig.samlConfig != null;
}

/**
 * Type guard to check if auth config has no authentication enabled.
 * @param authConfig The authConfig to check.
 * @returns true if the authConfig has no authentication enabled, false otherwise
 */
export function isNoAuthConfig(
  authConfig: AuthConfig
): authConfig is NoAuthConfig {
  return (
    authConfig.isPasswordEnabled === false && authConfig.samlConfig == null
  );
}

/**
 * Type guard to check if an array is non-empty.
 * @param array
 * @returns true if the array is non-empty, false otherwise
 */
export function isNonEmptyArray<T>(array: T[]): array is NonEmptyArray<T> {
  return array.length > 0;
}

/**
 * Parses a string using the provided parser function.
 * @param input The string to parse, or null/undefined for no value.
 * @param parser The parser function to use.
 * @returns A result object with success status. On success, contains the parsed value or null. On failure, contains an error message.
 */
export function parseData<T>(
  input: null | undefined,
  parser: (input: string) => T
): ParseSuccess<null>;
export function parseData<T>(
  input: string,
  parser: (input: string) => T
): ParseSuccessOrError<T>;
export function parseData<T>(
  input: string | null | undefined,
  parser: (input: string) => T
): ParseSuccessOrError<T | null>;
export function parseData<T>(
  input: string | null | undefined,
  parser: (input: string) => T
): ParseSuccessOrError<T | null> {
  if (input == null) {
    return { success: true, value: null };
  }

  try {
    return { success: true, value: parser(input) };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Parse SAML scopes from a given list of AuthenticationProvider scope strings.
 * @param scopes The list of scopes to parse.
 * @returns An object containing the server URL and SAML login URL if found, or null if not.
 */
export function parseSamlScopes(scopes: readonly string[]): {
  serverUrl: string;
  samlLoginUrl: string;
} | null {
  const serverUrl = scopes.find(scope =>
    scope.startsWith(`${DH_SAML_SERVER_URL_SCOPE_KEY}:`)
  );

  const samlLoginUrl = scopes.find(scope =>
    scope.startsWith(`${DH_SAML_LOGIN_URL_SCOPE_KEY}:`)
  );

  if (serverUrl && samlLoginUrl) {
    return {
      serverUrl: serverUrl.substring(DH_SAML_SERVER_URL_SCOPE_KEY.length + 1),
      samlLoginUrl: samlLoginUrl.substring(
        DH_SAML_LOGIN_URL_SCOPE_KEY.length + 1
      ),
    };
  }

  return null;
}

/**
 * Serialize a DH RefreshToken.
 * @param refreshToken The refresh token to serialize.
 * @returns The serialized refresh token.
 */
export function serializeRefreshToken(
  refreshToken?:
    | (DhcType.RefreshToken & {
        // TODO: Once the types changes made by DH-17975 have been published, we
        // should be able to update @deephaven-enterprise/jsapi-types and use
        // the proper RefreshToken type there and get rid of this augmentation.
        authenticatedUser?: string;
        effectiveUser?: string;
      })
    | null
): SerializableRefreshToken | null {
  if (refreshToken == null) {
    return null;
  }

  const { authenticatedUser, bytes, effectiveUser, expiry } = refreshToken;

  return {
    effectiveUser,
    authenticatedUser,
    bytes,
    expiry,
  } as SerializableRefreshToken;
}

/**
 * Create a sort comparator function that compares a stringified property on
 * 2 objects.
 * @param propName Prop to compare
 */
export function sortByStringProp<TPropName extends string>(
  propName: TPropName
) {
  return <TValue extends { [P in TPropName]: unknown }>(
    a: TValue,
    b: TValue
  ): number => {
    return String(a[propName]).localeCompare(String(b[propName]));
  };
}
