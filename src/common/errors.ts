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
  constructor(message: string) {
    super(message);
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
