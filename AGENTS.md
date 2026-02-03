# AI Agent Instructions for vscode-deephaven

## Testing

### Running Tests

- **ALWAYS** use the `runTests` tool instead of running tests via terminal commands
- **NEVER** use `npm test` or `npm run test` directly - these start watch mode
- **NEVER** use watch mode for tests - watch mode will hang and prevent the AI agent from continuing
- The `runTests` tool runs tests in single-run mode and returns results properly

### Test Discovery Issues

- If `runTests` returns 0 tests passed/failed when tests should exist, **ASK THE USER** to refresh the test list
- This is a known VS Code issue that sometimes requires manual refresh
- Do NOT spend time trying to debug or fix this yourself - just ask the user to refresh

### Using VS Code API Mocks

- **ALWAYS** check `__mocks__/vscode.ts` for existing VS Code API mocks before manually creating new ones
- The shared mock file contains mocks for common VS Code APIs (Uri, EventEmitter, Position, Range, DiagnosticCollection, etc.)
- To use the mocks, add `vi.mock('vscode')` at the top of your test file
- Use `vscode.languages.createDiagnosticCollection()` instead of manually mocking DiagnosticCollection
- If a needed mock doesn't exist, add it to `__mocks__/vscode.ts` so other tests can reuse it

### Mocking Module Dependencies

- **PREFER** mocking specific modules over barrel exports (e.g., `../../services/DhcService` instead of `../../services`)
- Targeting specific modules makes tests more maintainable and reduces the risk of unintended side effects
- Only use barrel exports when mocking the entire module is necessary

### Test Data Setup

- **PREFER** const variables or factory functions for test data that's reused across tests
- Factory functions are useful when test data needs slight variations between tests

### Test Structure

- **PREFER** `it.each` matrices when testing multiple input/output scenarios
- Use matrices for parameterized tests with different inputs and expected outputs
- Matrices improve test readability and reduce code duplication
- Example:
  ```typescript
  it.each([
    { input: 'invalid', expected: { success: false, error: 'Invalid input' } },
    { input: 'valid', expected: { success: true, data: 'result' } },
  ])('should handle $input correctly', async ({ input, expected }) => {
    const result = await handler({ value: input });
    expect(result).toEqual(expected);
  });
  ```

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
