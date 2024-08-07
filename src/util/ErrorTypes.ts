export class InvalidConsoleTypeError extends Error {
  constructor(type: string) {
    super(`Invalid console type: '${type}'`);
  }
}

export class NoConsoleTypesError extends Error {
  constructor() {
    super('No console types available');
  }
}
