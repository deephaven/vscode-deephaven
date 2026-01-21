# AI Agent Instructions for vscode-deephaven

## Testing

### Running Tests

- **ALWAYS** use the `runTests` tool instead of running tests via terminal commands
- **NEVER** use `npm test` or `npm run test` directly - these start watch mode
- **NEVER** use watch mode for tests - watch mode will hang and prevent the AI agent from continuing
- The `runTests` tool runs tests in single-run mode and returns results properly
