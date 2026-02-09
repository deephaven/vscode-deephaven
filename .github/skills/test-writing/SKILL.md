````skill
---
name: test-writing
description: Writes unit tests for `vscode-deephaven` using Vitest and TypeScript.
---

# Test Writing for vscode-deephaven

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

### 4. Use it.each for Multiple Scenarios

**Prefer `it.each` with inline test data** for parameterized tests:

```typescript
it.each([
  { label: 'success case', input: 'valid', expected: { success: true } },
  { label: 'error case', input: 'invalid', expected: { success: false } },
])('should handle $label', async ({ input, expected }) => {
  const result = await handler({ input });
  expect(result).toEqual(expected);
});
```

**For exhaustive combinations of parameters, use `matrixObject`** from `testUtils`:

```typescript
import { matrixObject, boolValues } from '../../testUtils';

it.each(
  matrixObject({
    isConnected: boolValues,        // [true, false]
    isRunning: boolValues,
    status: ['active', 'inactive'],
  })
)(
  'isConnected=$isConnected, isRunning=$isRunning, status=$status',
  ({ isConnected, isRunning, status }) => {
    // Test all 8 combinations (2 × 2 × 2)
    const result = processState({ isConnected, isRunning, status });
    expect(result).toBeDefined();
  }
);
```

### 5. Test Organization with describe Blocks

**Top-level `describe` must match the exported function name being tested.**

```typescript
import { createMyTool } from './myTool';

describe('createMyTool', () => {  // ← Always matches the export
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
````
