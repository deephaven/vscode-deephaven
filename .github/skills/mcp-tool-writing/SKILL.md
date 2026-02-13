---
name: mcp-tool-writing
description: Write MCP tools for the vscode-deephaven TypeScript MCP server. Use when adding new tools, implementing tool handlers, or creating tests for MCP tools.
license: Complete terms in LICENSE.txt
---

# MCP Tool Writing for vscode-deephaven

Guide for adding MCP tools to the vscode-deephaven extension's existing TypeScript MCP server.

## Overview

Specialized patterns for the vscode-deephaven MCP server. Consult the [`mcp-builder`](https://github.com/anthropics/skills/tree/main/skills/mcp-builder) skill (from [anthropics/skills](https://github.com/anthropics/skills) repo) for general MCP best practices, and the local `test-writing` skill (`.github/skills/test-writing/`) for testing patterns.

## Tool Implementation Pattern

### 1. File Structure

Create two files for each tool:

```
src/mcp/tools/
├── {toolName}.ts        # Tool implementation
└── {toolName}.spec.ts   # Tool tests
```

Export from `src/mcp/tools/index.ts`:

```typescript
export * from './{toolName}';
```

Register in `src/mcp/McpServer.ts` constructor:

```typescript
this.registerTool(create{ToolName}Tool(this));
```

### 2. Tool Implementation Template

See existing tools in `src/mcp/tools/` for complete examples. Key structure:

```typescript
import { z } from 'zod';
import type {
  McpTool,
  McpToolHandlerArg,
  McpToolHandlerResult,
} from '../../types';
import { createMcpToolOutputSchema, McpToolResponse } from '../utils';

const spec = {
  title: 'Tool Title',
  description: 'What the tool does and when to use it',
  inputSchema: {
    param: z.string().describe('Parameter description'),
  },
  outputSchema: createMcpToolOutputSchema({
    result: z.string().optional().describe('Result field'),
  }),
} as const;

type Spec = typeof spec;
type HandlerArg = McpToolHandlerArg<Spec>;
type HandlerResult = McpToolHandlerResult<Spec>;
type ToolNameTool = McpTool<Spec>;

export function createToolNameTool({
  serverManager,
}: {
  serverManager: IServerManager;
}): ToolNameTool {
  return {
    name: 'toolName',
    spec,
    handler: async ({ param }: HandlerArg): Promise<HandlerResult> => {
      const response = new McpToolResponse();
      return response.success('Done', { result });
    },
  };
}
```

### 3. Spec Definition Rules

**Input Schema:**

- Use Zod schemas directly as object properties (NOT `z.object()`)
- Add descriptive `.describe()` to every parameter
- Document expected formats (e.g., URLs, language IDs)

**Output Schema:**

- Always use `createMcpToolOutputSchema()` helper
- Pass optional details shape as object of Zod schemas
- Include ALL detail properties from every response call (success, error, errorWithHint)
- Make properties **required** only if present in ALL code paths; otherwise **optional** (missing required fields in error responses cause schema errors)
- Sort detail properties alphabetically
- Add descriptions for all fields

**Example:**

```typescript
const spec = {
  title: 'Get Table Stats',
  description:
    'Get schema information and basic statistics for a Deephaven table',
  inputSchema: {
    connectionUrl: z
      .string()
      .describe('Connection URL (e.g., "http://localhost:10000")'),
    tableName: z.string().describe('Name of the table to describe'),
  },
  outputSchema: createMcpToolOutputSchema({
    // Properties sorted alphabetically
    columns: z
      .array(
        z.object({
          name: z.string(),
          type: z.string(),
          description: z.string().optional(),
        })
      )
      .optional()
      .describe('Array of column definitions'),
    connectionUrl: z.string().optional().describe('Connection URL'),
    isRefreshing: z
      .boolean()
      .optional()
      .describe('Whether the table is refreshing (ticking)'),
    size: z.number().optional().describe('Number of rows in the table'),
    tableName: z.string().optional().describe('Name of the table'),
  }),
} as const;
```

### 4. Type Safety

Define type aliases for full type inference:

```typescript
type Spec = typeof spec;
type HandlerArg = McpToolHandlerArg<Spec>;
type HandlerResult = McpToolHandlerResult<Spec>;
type ToolNameTool = McpTool<Spec>;
```

### 5. Dependency Injection

Tools receive dependencies via constructor parameters:

```typescript
export function createGetTableStatsTool({
  serverManager,
}: {
  serverManager: IServerManager;
}): GetTableStatsTool {
  // Use serverManager in handler
}
```

**Dependency sources:**

- Check `McpServer.ts` constructor for available services to inject
- VS Code APIs can be used directly via `import * as vscode from 'vscode'`
- Commands available via `import { execXxx } from '../../common/commands'`
- Only request dependencies your tool actually needs

## Response Patterns

Instantiate `McpToolResponse` at handler start to track execution time:

```typescript
const response = new McpToolResponse();

// Success variants
return response.success('Done');
return response.success('Found 5 items', { items });
return response.successWithHint('Created', 'Next: use runCode', { url });

// Error variants
return response.error('Failed');
return response.error('Connection failed', error);
return response.error('Not found', null, { available: ['a', 'b'] });
return response.errorWithHint('Invalid', error, 'Use format: http://...', {
  url,
});
```

All responses include: `success`, `message`, `executionTimeMs`, optional `hint`, optional `details`.

## Common Patterns

### 1. URL Validation

```typescript
import { parseUrl } from '../../util';

const parsedUrl = parseUrl(connectionUrl);
if (!parsedUrl.success) {
  return response.error('Invalid URL', parsedUrl.error, {
    connectionUrl,
  });
}
// Use parsedUrl.value (a URL object)
```

### 2. Connection Management

For tools that interact with Deephaven servers:

```typescript
import { getFirstConnectionOrCreate } from '../utils';

const firstConnectionResult = await getFirstConnectionOrCreate({
  connectionUrl: parsedUrl.value,
  serverManager,
  languageId, // Optional: for better error hints
});

if (!firstConnectionResult.success) {
  const { details, error, errorMessage, hint } = firstConnectionResult;
  return response.errorWithHint(errorMessage, error, hint, details);
}

const { connection, panelUrlFormat } = firstConnectionResult;
// Use connection and panelUrlFormat
```

This helper:

- Finds or creates a connection
- Handles server validation
- Provides actionable error hints
- Returns panel URL format for UI linking

### 3. Session and Table Access

```typescript
const session = await connection.getSession();
if (!session) {
  return response.error('Unable to access session', null, { connectionUrl });
}

const table: DhcType.Table = await session.getObject({
  type: 'Table',
  name: tableName,
});

try {
  // Work with table
  return response.success('Success', {
    /* data */
  });
} finally {
  table.close(); // Always close tables
}
```

### 4. Resource Cleanup

Always close Deephaven resources:

```typescript
const table = await session.getObject({ type: 'Table', name: tableName });
try {
  // Use table
} finally {
  table.close();
}
```

## Testing

See `test-writing` skill for comprehensive patterns. MCP-specific essentials:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakeMcpToolTimings,
  mcpSuccessResult,
  mcpErrorResult,
} from '../utils/mcpTestUtils';

vi.mock('vscode');

beforeEach(() => {
  vi.clearAllMocks();
  fakeMcpToolTimings(); // Standardize execution time
});

// Assert results
expect(result.structuredContent).toEqual(mcpSuccessResult('Done', { data }));
expect(result.structuredContent).toEqual(mcpErrorResult('Failed', { url }));
```

## Integration Checklist

- [ ] Tool file created in `src/mcp/tools/{toolName}.ts`
- [ ] Test file created in `src/mcp/tools/{toolName}.spec.ts`
- [ ] Exported from `src/mcp/tools/index.ts`
- [ ] Registered in `src/mcp/McpServer.ts` constructor
- [ ] Spec follows naming conventions (title, description, schemas)
- [ ] Input schema has descriptions for all parameters
- [ ] Output schema uses `createMcpToolOutputSchema()`
- [ ] Output schema includes ALL detail properties from success and error responses
- [ ] Output detail properties sorted alphabetically
- [ ] Type aliases defined (Spec, HandlerArg, HandlerResult, Tool)
- [ ] Dependencies injected via constructor parameters
- [ ] McpToolResponse instantiated at handler start
- [ ] URL strings validated with `parseUrl()` (if tool accepts URLs)
- [ ] Error handling includes context details
- [ ] Resources cleaned up (tables closed, etc.)
- [ ] Tests follow `test-writing` skill guidance

## Reference

### Common Imports

```typescript
// Core types
import type {
  McpTool,
  McpToolHandlerArg,
  McpToolHandlerResult,
  IServerManager,
  IPanelService,
  IDhcService,
} from '../../types';

// Utilities
import { parseUrl } from '../../util';
import {
  createMcpToolOutputSchema,
  McpToolResponse,
  getFirstConnectionOrCreate,
} from '../utils';

// Zod
import { z } from 'zod';

// Deephaven types
import type { dh as DhcType } from '@deephaven/jsapi-types';

// VS Code (when needed)
import * as vscode from 'vscode';
```

### Tool Naming Conventions

- **Function name:** `create{ToolName}Tool` (PascalCase)
- **Tool name:** `{toolName}` (camelCase)
- **File name:** `{toolName}.ts` (camelCase)
- **Type alias:** `{ToolName}Tool` (PascalCase)

### Error Messages

Be specific, include context in details, provide actionable hints:

```typescript
return response.errorWithHint(
  'Column not found',
  null,
  'Use getTableStats to see available columns',
  { columnName, tableName, availableColumns: table.columns.map(c => c.name) }
);
```

## Additional Resources

- **MCP Best Practices:** Consult `mcp-builder` skill for general MCP patterns
- **Test Writing:** Consult `test-writing` skill for comprehensive testing guidance
- **Existing Tools:** Review `src/mcp/tools/` for implementation examples
- **Type Definitions:** See `src/types/mcpTypes.d.ts` for core types
- **Utilities:** See `src/mcp/utils/` for shared helpers
