// Branded type helpers
declare const __brand: unique symbol;
export type Brand<T extends string, TBase = string> = TBase & {
  readonly [__brand]: T;
};

export type SerializableRefreshToken = Brand<
  'SerializableRefreshToken',
  {
    bytes: string;
    expiry: number;
  }
>;
