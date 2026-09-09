import { WEB_CLIENT_DATA_CORE_QUERY } from '@deephaven-enterprise/query-utils';

export class ConnectionNotFoundError extends Error {
  constructor(connectionUrl: URL) {
    super(`No connection found for URL: ${connectionUrl}`);
    this.name = 'ConnectionNotFoundError';
  }
}

export class QueryCreationCancelledError extends Error {
  constructor() {
    super('Query creation cancelled');
    this.name = 'QueryCreationCancelledError';
  }
}

export class QueryStartupFailureError extends Error {
  constructor(public readonly status: string) {
    super(`Query start failed with status: ${status}`);
    this.name = 'QueryStartupFailureError';
  }
}

export class UnsupportedConsoleTypeError extends Error {
  constructor(serverUrl: URL, languageId: string) {
    super(`Connection '${serverUrl}' does not support '${languageId}'.`);
    this.name = 'UnsupportedConsoleTypeError';
  }
}

export class UnsupportedFeatureQueryError extends Error {
  constructor(message: string, serverUrl: string) {
    super(message);
    this.name = 'UnsupportedFeatureQueryError';
    this.serverUrl = serverUrl;
  }

  readonly serverUrl: string;
}

/**
 * Error thrown when the `WebClientData` Core+ system query required to fetch the
 * `QueryInfo` table is unavailable (not visible to the current user or not
 * running).
 */
export class WebClientDataUnavailableError extends Error {
  constructor(serverUrl: URL) {
    super(
      `The '${WEB_CLIENT_DATA_CORE_QUERY}' system query is unavailable on ${serverUrl}. ` +
        `The Persistent Queries table cannot be loaded until it is running and visible to you.`
    );
    this.name = 'WebClientDataUnavailableError';
  }
}
