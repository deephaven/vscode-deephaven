import type {
  AuthConfig,
  AuthFlow,
  MultiAuthConfig,
  NoAuthConfig,
  NonEmptyArray,
  SingleAuthConfig,
} from '../types';

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
