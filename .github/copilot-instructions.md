# AI Agent Instructions for vscode-deephaven

## Testing

### Running Tests

- **ALWAYS** use the `runTests` tool instead of running tests via terminal commands
- **NEVER** use `npm test` or `npm run test` directly - these start watch mode
- **NEVER** use watch mode for tests - watch mode will hang and prevent the AI agent from continuing
- The `runTests` tool runs tests in single-run mode and returns results properly

### Using VS Code API Mocks

- **ALWAYS** check `__mocks__/vscode.ts` for existing VS Code API mocks before manually creating new ones
- The shared mock file contains mocks for common VS Code APIs (Uri, EventEmitter, Position, Range, DiagnosticCollection, etc.)
- To use the mocks, add `vi.mock('vscode')` at the top of your test file
- Use `vscode.languages.createDiagnosticCollection()` instead of manually mocking DiagnosticCollection
- If a needed mock doesn't exist, add it to `__mocks__/vscode.ts` so other tests can reuse it

## Code Style

### Import Order

- Imports of `vscode` and 3rd party libraries should come before relative imports
- Example:
  ```typescript
  import * as vscode from 'vscode';
  import { vi } from 'vitest';
  import { MyLocalType } from './types';
  import { myUtil } from '../utils';
  ```
