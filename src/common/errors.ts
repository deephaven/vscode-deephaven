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
