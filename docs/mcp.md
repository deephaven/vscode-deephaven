# Model Context Protocol (MCP) Support

The Deephaven VS Code extension provides MCP (Model Context Protocol) server support, enabling AI assistants in VS Code and VS Code-based IDEs to interact with the Deephaven VS Code extension programmatically, and through it, with Deephaven servers.

## What is MCP?

The [Model Context Protocol](https://modelcontextprotocol.io/) is an open protocol that standardizes how AI assistants connect to external data sources and tools. By running as an MCP server, this extension exposes its functionality to AI assistants within VS Code and compatible IDEs, allowing them to:

- Connect to and manage Deephaven servers through the extension.
- Execute Python and Groovy code via the extension's connection management.
- Query connection states managed by the extension.
- Access the extension's output channels and logs.

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

**Via the Settings UI:**

1. Open VS Code Settings (`Cmd+,` on macOS, `Ctrl+,` on Windows/Linux).
2. Choose **User** settings (applies to all workspaces) or **Workspace** settings (applies only to the current workspace).
3. Search for `deephaven.mcp.enabled`.
4. Check the box to enable.

**Via `settings.json`:**

```json
{
  "deephaven.mcp.enabled": true
}
```

Once enabled, the MCP server automatically starts when the extension loads, listening on a local HTTP endpoint. Each workspace gets a unique auto-allocated port, which is displayed in a status bar item as `MCP:<port>`.

#### Documentation Queries

The extension provides a separate MCP server for querying Deephaven documentation, which is enabled by default when the main MCP server is enabled.

**Setting**: `deephaven.mcp.docsEnabled` (default: `true`)

This setting controls whether documentation queries are available to AI assistants. When `deephaven.mcp.enabled` is `true`, the documentation server is automatically enabled unless `deephaven.mcp.docsEnabled` is set to `false`.

To disable documentation queries while keeping the extension's MCP tools available:

```json
{
  "deephaven.mcp.enabled": true,
  "deephaven.mcp.docsEnabled": false
}
```

#### VS Code with GitHub Copilot

When using GitHub Copilot in VS Code, the extension's MCP server is automatically configured and available once enabled. No additional configuration is required.

#### Windsurf

Windsurf automatically detects and connects to the MCP server when the Deephaven extension is active. No additional configuration is required.

> **Note:** Since each workspace uses a unique port and Windsurf only supports user-level MCP configuration, the extension will automatically update the MCP configuration when a Windsurf window becomes active to match the current workspace's port. This has not been thoroughly tested and may require manual steps, such as restarting IDE/agent sessions.

#### Other VS Code-based IDEs

For other VS Code-based IDEs that support MCP, you may need to configure the MCP server endpoint in your IDE's settings.

The MCP server uses an auto-allocated port that varies per session. When the MCP server starts, a status bar item will display `MCP:<port>` showing the actual port being used. The endpoint URL follows the format:

```
http://localhost:<port>/mcp
```

> **Note:** The port is unique per workspace. If you switch workspaces, you may need to update your MCP configuration with the new port shown in the status bar. Most IDEs don't yet seem to support workspace-level MCP configs, so settings may have to be updated at the user level. This may also require restarting agent sessions, MCP tool caches, etc.

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

- **Server Management** - Connect to and list configured Deephaven servers.

  - `connectToServer` - Create a connection to a server.
  - `listServers` - List all configured servers.

- **Connection Management** - Query active connections.

  - `listConnections` - List active connections, optionally filtered by URL.

- **Code Execution** - Run Python and Groovy code.

  - `runCode` - Execute arbitrary code text.
  - `runCodeFromUri` - Execute code from workspace files.

- **Variables** - Query and interact with Deephaven variables.

  - `listVariables` - List all variables on a connection.
  - `openVariablePanels` - Open variable panels for specific variables.

- **Table Data & Statistics** - Fetch and analyze table data.

  - `getTableData` - Fetch paginated data from a table.
  - `getTableStats` - Get schema information and basic statistics.
  - `getColumnStats` - Get statistical information for a column.

- **Remote File Sources** - Manage server file source paths.

  - `addRemoteFileSources` - Add folders as remote file sources.
  - `listRemoteFileSources` - List current remote file sources.
  - `removeRemoteFileSources` - Remove remote file sources.

- **Output & Logging** - Access extension logs.
  - `getLogs` - Retrieve server or debug logs.
  - `showOutputPanel` - Display output panel in VS Code.

For detailed documentation on each tool including parameters, return types, and examples, see [MCP Tool Reference](mcp-tools.md).

## Chat Skills

In addition to MCP tools, the extension provides Chat Skills that can be registered with supported AI assistants (e.g., GitHub Copilot, Windsurf) to provide domain-specific knowledge and capabilities.

### Available Chat Skills

1. **Deephaven VS Code Usage** (`deephaven-vscode-using`)

   - Manages Deephaven server connections and code execution through VS Code MCP tools.
   - Handles connecting to DHC/DHE servers, executing Python/Groovy code.
   - Provides workflows for opening variable panels and troubleshooting connection issues.
   - Use when working with the vscode-deephaven extension's MCP tools.

2. **Deephaven Documentation Searching** (`deephaven-docs-searching`)
   - Queries Deephaven documentation for API help, syntax guidance, and best practices.
   - Provides answers about table operations, filtering, joining, aggregations, plotting, and other Deephaven features.
   - Supports both Python and Groovy.
   - Does NOT require a running server or connection - purely documentation queries.

### Chat Skills Configuration

Chat Skills are automatically registered when the extension loads. They are available in supported AI assistants like GitHub Copilot and Windsurf.

The Deephaven Documentation Searching skill connects to the [Deephaven Docs MCP server](https://deephaven.io/enterprise/docs/clients/mcp/#docs-server), which is automatically configured by the extension when enabled. The extension provides the auto-configuration and the chat skill to make AI assistants aware of the documentation capabilities. For more information about the Deephaven Docs MCP server itself, see the [official documentation](https://deephaven.io/enterprise/docs/clients/mcp/#docs-server).

The documentation server can be independently enabled/disabled via the `deephaven.mcp.docsEnabled` setting:

**Setting**: `deephaven.mcp.docsEnabled` (default: `true`)

When `deephaven.mcp.enabled` is `true`, documentation queries are enabled by default. Set `deephaven.mcp.docsEnabled` to `false` to disable documentation queries while keeping the extension's MCP tools available.

## Tool Response Format

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

- **VS Code with GitHub Copilot** - Fully supported and tested.
- **Windsurf** - Fully supported and tested.
- **Other VS Code-based IDEs** (e.g., Cursor) - May work but untested; requires manual MCP server configuration.

### AI Assistant Support

- **GitHub Copilot** - Automatically configured.
- **Windsurf's built-in agent** - Automatically configured.
- **Other AI assistants** (e.g., VS Code-based IDEs, AI extensions like Cline) - Automatic configuration not implemented; requires manual MCP server configuration (untested).
