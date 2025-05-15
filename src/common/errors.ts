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
