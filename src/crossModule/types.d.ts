// Branded type helpers
declare const __brand: unique symbol;
export type Brand<T extends string, TBase = string> = TBase & {
  readonly [__brand]: T;
};

export type BaseThemeType = 'dark' | 'light';
export type BaseThemeKey = `default-${BaseThemeType}`;
export type ThemeCssColorVariableName = `--dh-color-${string}`;

export interface ExternalThemeData {
  baseThemeKey?: BaseThemeKey;
  name: string;
  cssVars: Record<ThemeCssColorVariableName, string>;
}

export type SerializableRefreshToken = Brand<
  'SerializableRefreshToken',
  {
    bytes: string;
    expiry: number;
  }
>;

export type QuerySerial = Brand<'QuerySerial', string>;

/**
 * This is an opaque type representing `ConsoleSettings` defined in DHE web. The
 * extension doesn't care about the details since it persists it as-is to
 * remember user worker creation preferences.
 */
export type ConsoleSettings = Brand<'ConsoleSettings', Record<string, unknown>>;

/**
 * Copy of `CreateWorkerIframeSettings` in DHE web.
 */
export interface CreateWorkerIframeSettings {
  newWorkerName: string;
  settings: Partial<ConsoleSettings>;
  showHeader?: boolean;
}
