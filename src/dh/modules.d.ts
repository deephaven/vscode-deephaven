/**
 * Augment types that are missing in current jsapi-types.
 */
declare module '@deephaven-enterprise/jsapi-types' {
  interface EnterpriseClient {
    deleteQueries(querySerials: string[]): Promise<void>;
  }
}

export {};
