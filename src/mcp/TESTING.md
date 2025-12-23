# Testing the MCP Server

## Quick Start

1. **Start the Extension**: Press `F5` to launch in debug mode
2. **Verify Server Started**: Look for notification "Deephaven MCP Server started on http://localhost:3000/mcp"
3. **Run Tests**: Use one of the methods below

## Method 1: Using the Test Script

```bash
./test-mcp.sh
```

This will test:
- Listing available tools
- Calling the runCode tool

## Method 2: Manual curl Commands

### List Available Tools
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'
```

Expected response:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "runCode",
        "description": "Execute code in a Deephaven session...",
        "inputSchema": { ... }
      }
    ]
  }
}
```

### Call runCode Tool
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "runCode",
      "arguments": {
        "languageId": "python"
      }
    }
  }'
```

## Method 3: Configure Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "deephaven": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

Restart Claude Desktop, and you should see the `runCode` tool available.

## Method 4: Test with VS Code Terminal

1. Open a Python file in your workspace
2. Make sure you have a Deephaven connection active
3. From VS Code terminal, test with curl (as above)
4. The runCode tool should execute the current file or selection

## Troubleshooting

- **Server not starting**: Check the "Deephaven" output channel for errors
- **Port already in use**: Change the port in `ExtensionController.ts` (line 420)
- **No response**: Verify the extension is running with `F5`
- **Tool not found**: Make sure the server started successfully
