````markdown
# MCP Tools Testing Context

Use this context when writing tests for MCP tools in `src/mcp/tools/`.

## MCP Test Utilities

Located in `src/mcp/utils/mcpTestUtils.ts`:

```typescript
import {
  fakeMcpToolTimings,
  mcpSuccessResult,
  mcpErrorResult,
  MOCK_DHC_URL,
  createMockDhcService,
} from '../utils/mcpTestUtils';
```

### Setup MCP Mocks

All MCP tests should call `fakeMcpToolTimings()` in `beforeEach`:

```typescript
beforeEach(() => {
  vi.clearAllMocks();
  fakeMcpToolTimings(); // Sets up execution time mocking and other MCP responses
});
```

Do NOT manually mock `McpToolResponse.prototype.getElapsedTimeMs` or import `MOCK_EXECUTION_TIME_MS` - these are internal details handled by `fakeMcpToolTimings()`.

### Result Helpers

Always use these helpers for result assertions:

```typescript
// Success result
expect(result.structuredContent).toEqual(
  mcpSuccessResult('Operation successful', {
    data: 'value',
    panelUrlFormat: 'format',
  })
);

// Error result with optional hint
expect(result.structuredContent).toEqual(
  mcpErrorResult(
    'Operation failed',
    { connectionUrl: MOCK_DHC_URL.href },
    'Use connectToServer first' // optional hint
  )
);
```

### URL Mocking

Use the shared `MOCK_DHC_URL` constant:

```typescript
import { MOCK_DHC_URL } from '../utils/mcpTestUtils';

// For URL object parameter
expect(service.method).toHaveBeenCalledWith(MOCK_DHC_URL);

// For string URL parameter
const result = await tool.handler({ connectionUrl: MOCK_DHC_URL.href });
```

## MCP Tool Structure

### Tool Spec Test Naming

Use consistent naming for tool spec tests:

```typescript
it('should return correct tool spec', () => {
  const tool = createMyTool({ dependencies });

  expect(tool.name).toBe('toolName');
  expect(tool.spec.title).toBe('Tool Title');
  expect(tool.spec.description).toBe('Description');
  expect(tool.spec.inputSchema.properties).toHaveProperty('paramName');
});
```

### Test Tool Handler

```typescript
it('should handle request successfully', async () => {
  vi.mocked(dependency.method).mockResolvedValue(mockData);

  const tool = createMyTool({ dependency });
  const result = await tool.handler({ input: 'value' });

  expect(result.structuredContent).toEqual(
    mcpSuccessResult('Success', { data: mockData })
  );
});
```

## Common MCP Patterns

### Server Connection Tests

Tools that use `getFirstConnectionOrCreate`:

```typescript
vi.mock('../utils/serverUtils', async () => {
  const actual = await vi.importActual('../utils/serverUtils');
  return {
    ...actual,
    getFirstConnectionOrCreate: vi.fn(),
  };
});

// Success case
vi.mocked(getFirstConnectionOrCreate).mockResolvedValue({
  success: true,
  connection: {} as IDhcService,
  panelUrlFormat: 'mock.format',
});

// Error case
vi.mocked(getFirstConnectionOrCreate).mockResolvedValue({
  success: false,
  errorMessage: 'No active connection',
  hint: 'Use connectToServer first',
  details: { connectionUrl: MOCK_DHC_URL.href },
});
```

### URL Validation Tests

```typescript
it('should handle invalid URL', async () => {
  const tool = createMyTool({ dependencies });
  const result = await tool.handler({ connectionUrl: 'invalid-url' });

  expect(result.structuredContent).toEqual(
    mcpErrorResult('Invalid URL: Invalid URL', {
      connectionUrl: 'invalid-url',
    })
  );
});
```

### Error Propagation Tests

```typescript
it('should handle errors from dependencies', async () => {
  vi.mocked(service.method).mockImplementation(() => {
    throw new Error('Test error');
  });

  const tool = createMyTool({ service });
  const result = await tool.handler({ input: 'value' });

  expect(result.structuredContent).toEqual(
    mcpErrorResult('Failed to execute: Test error')
  );
});
```

## Example Tests

See these for MCP-specific patterns:

- `listPanelVariables.spec.ts` - Panel service integration
- `openVariablePanels.spec.ts` - Command execution
- `connectToServer.spec.ts` - Server manager integration
- `runCode.spec.ts` - Code execution validation
````
