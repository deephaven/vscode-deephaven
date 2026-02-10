# AI Agent Instructions for vscode-deephaven

## Testing

### Running Tests

- **ALWAYS** use `npx vitest run` in the terminal for running tests
- When user says "run tests" or "run the tests", use: `npx vitest run`
- When user says "run [filename].spec", use: `npx vitest run src/path/to/[filename].spec.ts`
- **NEVER** use `npm test` or `npm run test` - these start watch mode
- **NEVER** use watch mode for tests - watch mode will hang and prevent the AI agent from continuing
- **AVOID** using the `runTests` tool - it has issues with workspace selection and requires manual UI refresh
- Always run vitest from the correct workspace directory

### Checking for TypeScript Errors

- **ALWAYS** use the `get_errors` tool after editing test files to catch TypeScript errors
- After making changes to .spec.ts files, run `get_errors` on those files before running tests
- TypeScript errors won't always cause test failures but should be fixed for code quality

### Test Discovery Issues

- If tests fail to run or show unexpected results, verify you're in the correct workspace directory
- Check that vitest can find the test files by running `npx vitest run --reporter=verbose` if needed

### Writing Tests

For detailed instructions on writing tests (mocking patterns, test structure, MCP tools testing, etc.), consult the **test-writing skill**:

- **Main skill**: `.github/skills/test-writing/SKILL.md`
- **MCP-specific patterns**: `.github/skills/test-writing/mcp-tools-testing.md`

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
