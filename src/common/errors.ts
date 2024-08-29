export class UnsupportedConsoleTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedConsoleTypeError';
  }
}
