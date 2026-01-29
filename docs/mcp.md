# Model Context Protocol (MCP) Support

The Deephaven VS Code extension provides MCP (Model Context Protocol) server support, enabling AI assistants in VS Code and VS Code-based IDEs to interact with the Deephaven VS Code extension programmatically, and through it, with Deephaven servers.

## What is MCP?

The [Model Context Protocol](https://modelcontextprotocol.io/) is an open protocol that standardizes how AI assistants connect to external data sources and tools. By running as an MCP server, this extension exposes its functionality to AI assistants within VS Code and compatible IDEs, allowing them to:

- Connect to and manage Deephaven servers through the extension
- Execute Python and Groovy code via the extension's connection management
- Query connection states managed by the extension
- Access the extension's output channels and logs

## Getting Started

### Prerequisites

- Deephaven VS Code extension installed
- VS Code or a VS Code-based IDE (Windsurf, Cursor, etc.)
- GitHub Copilot or built-in AI assistant in your IDE
- At least one configured Deephaven server (see [Configuration](configuration.md))

### Configuration

The MCP server is disabled by default. To use MCP features, you must first enable it in your VS Code settings.

#### Enabling/Disabling MCP Server

The MCP server can be controlled via the VS Code setting:

**Setting**: `deephaven.mcp.enabled` (default: `false`)

To enable the MCP server, set this to `true` in your VS Code settings (UI or JSON):

**Via Settings UI:**

1. Open VS Code Settings (`Cmd+,` on macOS, `Ctrl+,` on Windows/Linux)
2. Choose **User** settings (applies to all workspaces) or **Workspace** settings (applies only to the current workspace)
3. Search for `deephaven.mcp.enabled`
4. Check the box to enable

**Via settings.json:**

```json
{
  "deephaven.mcp.enabled": true
}
```

Once enabled, the MCP server automatically starts when the extension loads, listening on a local HTTP endpoint. Each workspace gets a unique auto-allocated port, which is displayed in a status bar item as `MCP:<port>`.

#### VS Code with GitHub Copilot

When using GitHub Copilot in VS Code, the extension's MCP server is automatically configured and available once enabled. No additional configuration is required.

#### Windsurf

Windsurf automatically detects and connects to the MCP server when the Deephaven extension is active. No additional configuration is required.

> **Note:** Since each workspace uses a unique port and Windsurf only supports user-level MCP configuration, the extension will automatically update the MCP configuration when a Windsurf window becomes active to match the current workspace's port. This has not been thoroughly tested and may require manual actions such as restarting IDE / agent sessions.

#### Other VS Code-based IDEs

For other VS Code-based IDEs that support MCP, you may need to configure the MCP server endpoint in your IDE's settings.

The MCP server uses an auto-allocated port that varies per session. When the MCP server starts, a status bar item will display `MCP:<port>` showing the actual port being used. The endpoint URL follows the format:

```
http://localhost:<port>/mcp
```

> **Note:** The port is unique per workspace. If you switch workspaces, you may need to update your MCP configuration with the new port shown in the status bar. Most IDEs don't yet seem to support workspace level MCP configs, so settings may have to be updated at the user level. This may also require restarting agent sessions, MCP tool caches, etc.

Example configuration (format may vary by IDE):

```json
{
  "mcp.servers": {
    "deephaven": {
      "url": "http://localhost:45678/mcp"
    }
  }
}
```

Replace `45678` with the actual port shown in the `MCP:<port>` status bar item.

## Available Tools

The MCP server provides tools for:

- **Server Management** - Connect to and list configured Deephaven servers
  - `connectToServer` - Create a connection to a server
  - `listServers` - List all configured servers

- **Connection Management** - Query active connections
  - `listConnections` - List active connections, optionally filtered by URL

- **Code Execution** - Run Python and Groovy code
  - `runCode` - Execute arbitrary code text
  - `runCodeFromUri` - Execute code from workspace files

- **Output & Logging** - Access extension logs
  - `getLogs` - Retrieve server or debug logs
  - `showOutputPanel` - Display output panel in VS Code

For detailed documentation on each tool including parameters, return types, and examples, see [MCP Tool Reference](mcp-tools.md).

All MCP tools follow a consistent response structure:

### Success Response

```json
{
  "success": true,
  "message": "Operation completed",
  "executionTimeMs": 42,
  "details": {
    // Tool-specific data
  }
}
```

### Error Response

```json
{
  "success": false,
  "message": "Operation failed",
  "executionTimeMs": 15,
  "details": {
    // Contextual error information
  },
  "hint": "Actionable guidance for fixing the error"
}
```

## Supported IDEs

The MCP server provided by this extension is designed specifically for VS Code and IDEs built on top of VS Code:

- **VS Code with GitHub Copilot** - Fully supported and tested
- **Windsurf** - Fully supported and tested
- **Other VS Code-based IDEs** (e.g., Cursor) - May work but untested; requires manual MCP server configuration

### AI Assistant Support

- **GitHub Copilot** - Automatically configured
- **Windsurf's built-in agent** - Automatically configured
- **Other AI assistants** (e.g., VS Code-based IDEs, AI extensions like Cline) - Automatic configuration not implemented; requires manual MCP server configuration (untested)
