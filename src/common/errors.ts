export class QueryCreationCancelledError extends Error {
  constructor() {
    super('Query creation cancelled');
    this.name = 'QueryCreationCancelledError';
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
