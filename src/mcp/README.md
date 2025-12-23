# Deephaven MCP Server

This extension includes a Model Context Protocol (MCP) server that enables AI assistants (like GitHub Copilot) to interact with Deephaven sessions.

## Overview

The MCP server runs as an HTTP server on port 3000 (by default) and provides tools that AI assistants can use to execute commands in the Deephaven extension.

## Available Tools

### `runCode`

Execute code in a Deephaven session.

**Parameters:**
- `uri` (optional): The file URI to run. If not provided, runs the active editor.
- `constrainTo` (optional): Set to `"selection"` to constrain execution to current selection.
- `languageId` (optional): The language ID (`python` or `groovy`) to use for execution.

**Example:**
```json
{
  "name": "runCode",
  "arguments": {
    "uri": "file:///path/to/script.py"
  }
}
```

## Server Configuration

The MCP server starts automatically when the extension activates. By default, it listens on:
- **URL**: `http://localhost:3000/mcp`
- **Transport**: SSE (Server-Sent Events)

## Connecting from AI Assistants

To connect an AI assistant to this MCP server, you'll need to configure it with:

1. **Server URL**: `http://localhost:3000/mcp`
2. **Transport Type**: SSE (Server-Sent Events)

### Example Configuration for Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "deephaven": {
      "url": "http://localhost:3000/mcp",
      "transport": "sse"
    }
  }
}
```

## Development

### Adding New Tools

To add a new tool to the MCP server:

1. Add the tool definition in `MCPServer.setupToolHandlers()`:
   ```typescript
   tools: [
     {
       name: 'myNewTool',
       description: 'Description of what the tool does',
       inputSchema: {
         type: 'object',
         properties: {
           // Define parameters here
         },
       },
     },
   ]
   ```

2. Add a handler in the `CallToolRequestSchema` handler:
   ```typescript
   if (request.params.name === 'myNewTool') {
     // Handle the tool execution
   }
   ```

### Testing

To test the MCP server:

1. Install the extension in development mode
2. Check that the server starts (you should see a notification)
3. Use a tool like `curl` or Postman to send requests to `http://localhost:3000/mcp`

## Architecture Notes

- The MCP server runs in the same process as the VS Code extension
- It uses VS Code's command execution API (`vscode.commands.executeCommand`) to invoke extension commands
- This avoids the complexity of stdio-based MCP servers and allows the extension to remain active while serving MCP requests
