---
name: test-writing
description: Writes unit tests for `vscode-deephaven` using Vitest and TypeScript.
---

# Test Writing for vscode-deephaven

## Running Tests

Run tests using vitest:

```bash
# Run all tests
npx vitest run

# Run specific test file
npx vitest run src/path/to/file.spec.ts

# Run multiple specific files
npx vitest run src/mcp/tools/getColumnStats.spec.ts src/mcp/tools/getTableStats.spec.ts
```

**Important:** Always use `npx vitest run`, not `npm test` or `npm run test` (those start watch mode).

## Codebase-Specific Conventions

### 1. Shared VS Code Mocks

**Always check `__mocks__/vscode.ts` before creating new mocks.** Read the file to see what's available (e.g., `Uri`, `EventEmitter`, `DiagnosticCollection`, etc.).

```typescript
vi.mock('vscode');

// Use shared mocks, don't recreate them
const diagnosticCollection = vscode.languages.createDiagnosticCollection();
```

### 2. Mock Specific Modules, Not Barrel Exports

```typescript
// ✅ Specific module
vi.mock('../../services/DhcService', async () => {
  const actual = await vi.importActual('../../services/DhcService');
  return { ...actual, specificFunction: vi.fn() };
});

// ❌ Barrel export (too broad)
vi.mock('../../services');
```

### 3. Import Order

```typescript
// 1. vscode and 3rd party
import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// 2. Types
import type { IDhcService } from '../../types';

// 3. Relative imports
import { myFunction } from './myFunction';
```

**Import modules at the top of the file, not in tests.** Avoid `await import()` within test functions.

```typescript
// ✅ Import at top of file
import { myUtil } from '../util';

describe('myFunction', () => {
  it('should work', () => {
    const result = myUtil();
    expect(result).toBe(true);
  });
});

// ❌ Avoid importing in tests
describe('myFunction', () => {
  it('should work', async () => {
    const { myUtil } = await import('../util'); // Unnecessary
    const result = myUtil();
    expect(result).toBe(true);
  });
});
```

### 4. Prefer it.each for Test Variations

**Default to `it.each` for testing multiple scenarios.** This includes cases with different inputs, outputs, mock configurations, or state variations.

#### When to Use it.each

**Use `it.each` whenever you test the same code path with:**

- Different input/output pairs
- Different mock return values representing state scenarios
- Different configuration states (enabled/disabled, connected/disconnected)
- Edge cases and boundary conditions
- Reference quality checks (same vs different object references)

**Key principle:** If mocks represent state scenarios that can be expressed as values, use `it.each`. Don't avoid it just because mocks differ - different mock _values_ are perfect for parameterization.

#### Basic Parameterized Tests

```typescript
it.each([
  { label: 'success case', input: 'valid', expected: { success: true } },
  { label: 'error case', input: 'invalid', expected: { success: false } },
])('should handle $label', async ({ input, expected }) => {
  const result = await handler({ input });
  expect(result).toEqual(expected);
});
```

#### Parameterizing Mock State

```typescript
it.each([
  {
    label: 'MCP enabled',
    mcpEnabled: true,
    mcpDocsEnabled: true,
    expectedServers: 2,
  },
  {
    label: 'MCP disabled',
    mcpEnabled: false,
    mcpDocsEnabled: true,
    expectedServers: 0,
  },
  {
    label: 'docs disabled',
    mcpEnabled: true,
    mcpDocsEnabled: false,
    expectedServers: 1,
  },
])(
  'should handle $label',
  ({ mcpEnabled, mcpDocsEnabled, expectedServers }) => {
    configMap.set(CONFIG_KEY.mcpEnabled, mcpEnabled);
    configMap.set(CONFIG_KEY.mcpDocsEnabled, mcpDocsEnabled);

    const result = updateServers();

    expect(result.servers).toHaveLength(expectedServers);
  }
);
```

#### Exhaustive State Combinations with matrixObject

For testing all combinations of boolean flags or enums, use `matrixObject` from `testUtils`:

```typescript
import { matrixObject, boolValues } from '../../testUtils';

it.each(
  matrixObject({
    isConnected: boolValues, // [true, false]
    isRunning: boolValues,
    status: ['active', 'inactive'],
  })
)(
  'isConnected=$isConnected, isRunning=$isRunning, status=$status',
  ({ isConnected, isRunning, status }) => {
    // Test all 8 combinations (2 × 2 × 2)
    vi.mocked(service.isConnected).mockReturnValue(isConnected);
    vi.mocked(service.isRunning).mockReturnValue(isRunning);
    configMap.set(CONFIG_KEY.status, status);

    const result = processState();
    expect(result).toBeDefined();
  }
);
```

### 5. Test Organization with describe Blocks

**Top-level `describe` must match the exported function name being tested.**

```typescript
import { createMyTool } from './myTool';

describe('createMyTool', () => {
  // ← Always matches the export
  it('should return correct tool spec', () => {});
  it('should handle valid input', () => {});
});
```

**Use nested `describe` blocks sparingly** - only when additional grouping adds clarity:

```typescript
describe('createComplexTool', () => {
  it('should return correct tool spec', () => {});

  // Optional nested grouping for clarity
  describe('input validation', () => {
    it('should reject empty input', () => {});
    it('should reject invalid format', () => {});
  });

  describe('error handling', () => {
    it('should handle connection errors', () => {});
  });
});
```

### 6. Always Clear Mocks

```typescript
beforeEach(() => {
  vi.clearAllMocks();
});
```

### 7. Linting

After making changes to test files, run the linter and fix any errors:

```bash
npm run test:lint
```

## Common Patterns

### Partial Module Mocking

```typescript
vi.mock('../utils/serverUtils', async () => {
  const actual = await vi.importActual('../utils/serverUtils');
  return {
    ...actual,
    getFirstConnectionOrCreate: vi.fn(), // Only mock this
  };
});
```

### Test Data Setup

```typescript
// Use shared constants from test utilities when available
import { MOCK_DHC_URL } from '../../utils/mcpTestUtils';

// For test-specific data, use constants
const mockData = { value: 'test' };

// Factory functions for variations
const createMockServer = (overrides = {}) => ({
  url: MOCK_DHC_URL,
  type: 'DHC',
  ...overrides,
});
```

## Examples

Study these for patterns:

- `src/mcp/tools/listPanelVariables.spec.ts` - Parameterized tests with `it.each`
- `src/mcp/tools/openVariablePanels.spec.ts` - Input validation patterns

## MCP Tools Testing

**For testing MCP tools** (`src/mcp/tools/`), see **[mcp-tools-testing.md](mcp-tools-testing.md)** for:

- MCP test utilities (`fakeMcpToolTimings`, `mcpSuccessResult`, `mcpErrorResult`)
- URL mocking patterns
- Tool spec and handler testing
- Server connection and error propagation patterns
