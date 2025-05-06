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
