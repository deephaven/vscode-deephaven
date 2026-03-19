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

MCP support is disabled by default. To use MCP features, you must first enable it in your VS Code settings.

#### MCP Server Settings

The extension provides two settings to control MCP functionality:

| Setting                     | Default | Description                                                                                  |
| --------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| `deephaven.mcp.enabled`     | `false` | Enables/disables MCP servers. Must be `true` for any MCP features to work.                   |
| `deephaven.mcp.docsEnabled` | `true`  | Enables/disables documentation queries. Only applies when `deephaven.mcp.enabled` is `true`. |

**To enable the MCP server:**

1. Look for the Deephaven MCP status bar item (shows "MCP: Disabled" when off).

   ![MCP Disabled](assets/mcp-disabled.png)

2. Click the status bar item and select **Enable Deephaven MCP Server**.

   ![Enable Deephaven MCP Server](assets/mcp-enable.png)

3. The status bar will update to show `MCP:<port>` with the assigned port number.

   ![MCP Enabled](assets/mcp-enabled.png)

This automatically sets `"deephaven.mcp.enabled": true` in your workspace settings (`.vscode/settings.json`). The MCP server starts immediately, listening on a local HTTP endpoint. Each workspace gets a unique port.

#### Docs MCP Server Configuration

The Deephaven Documentation Searching skill connects to the [Deephaven Docs MCP server](https://deephaven.io/enterprise/docs/clients/mcp/#docs-server). The server is automatically configured for Github Copilot or can be manually configured for other agents as described in [Manual MCP Server Configuration](#manual-mcp-server-configuration). The extension skill makes AI assistants aware of the documentation capabilities. For more information about the Deephaven Docs MCP server itself, see the [official documentation](https://deephaven.io/enterprise/docs/clients/mcp/#docs-server).

The documentation server can be independently enabled/disabled via the `deephaven.mcp.docsEnabled` setting:

**Setting**: `deephaven.mcp.docsEnabled` (default: `true`)

When `deephaven.mcp.enabled` is `true`, documentation queries are enabled by default. Set `deephaven.mcp.docsEnabled` to `false` to disable documentation queries while keeping the extension's MCP tools available.

#### IDE-Specific Configuration

Different IDEs require different MCP server configuration:

| IDE                             | Auto-Configured              | MCP Configuration File                |
| ------------------------------- | ---------------------------- | ------------------------------------- |
| **VS Code with GitHub Copilot** | ✅ Yes                       | None required                         |
| **Windsurf**                    | ✅ Yes (after user approval) | `~/.codeium/windsurf/mcp_config.json` |
| **Claude in VS Code-based IDE** | ❌ No                        | `<wksp-folder>/.mcp.json`             |
| **Cursor**                      | ❌ No                        | `<wksp-folder>/.cursor/mcp.json`      |
| **Other VS Code-based IDEs**    | ❌ No                        | Varies by IDE                         |

#### Manual MCP Server Configuration

For IDEs that require manual configuration (Cursor and other VS Code-based IDEs) or Claude running in VS Code-based IDEs, you'll need to configure the MCP server endpoint. The MCP server port is displayed in the status bar as `MCP:<port>` when running. You can click the status bar item to copy the full endpoint URL to your clipboard. The endpoint URL follows the format: `http://localhost:<port>/mcp`.

**Cursor:**

Create a `.cursor/mcp.json` file in your workspace root:

```json
{
  "mcpServers": {
    "Deephaven VS Code": {
      "url": "http://localhost:<port>/mcp"
    },
    "Deephaven Documentation": {
      "url": "https://deephaven-mcp-docs-prod.dhc-demo.deephaven.io/mcp"
    }
  }
}
```

**Claude in VS Code-based IDE:**

Create a `.mcp.json` file in your workspace root:

```json
{
  "mcpServers": {
    "Deephaven VS Code": {
      "type": "http",
      "url": "http://localhost:<port>/mcp"
    },
    "Deephaven Documentation": {
      "type": "http",
      "url": "https://deephaven-mcp-docs-prod.dhc-demo.deephaven.io/mcp"
    }
  }
}
```

> **Note:** This configuration should work for Claude running in any VS Code-based IDE that supports the Deephaven extension (VS Code, Cursor, Windsurf, etc.).

**Other IDEs:**

Configuration format varies by IDE but should be similar to the examples above. Consult your IDE's MCP documentation for the specific configuration file location and format.

> **Note:** After configuration changes, you may need to restart agent sessions or clear MCP tool caches.

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

## Agent Skills

In addition to MCP tools, the extension provides agent skills that can be registered with supported AI assistants to provide domain-specific knowledge and capabilities. For GitHub Copilot users, the skills are automatically registered when the extension loads. Other agents require manual installation.

### Provided Skills

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

### Installation Options

> Note: GitHub Copilot users should have access to the skills automatically and don't need to install anything.

1. **Using `npx skills` (recommended if you have Node.js installed):**

   ```bash
   npx skills add deephaven/vscode-deephaven -g -s deephaven-vscode-using
   npx skills add deephaven/vscode-deephaven -g -s deephaven-docs-searching
   ```

1. **Manual installation:**
   - Navigate to the [skills folder](https://github.com/deephaven/vscode-deephaven/tree/main/skills) in the vscode-deephaven repository.
   - Download the `SKILL.md` file from each skill you want to use:
     - [deephaven-vscode-using/SKILL.md](https://github.com/deephaven/vscode-deephaven/tree/main/skills/deephaven-vscode-using/SKILL.md) - For interacting with Deephaven through the VS Code extension's MCP tools
     - [deephaven-docs-searching/SKILL.md](https://github.com/deephaven/vscode-deephaven/tree/main/skills/deephaven-docs-searching/SKILL.md) - For querying Deephaven documentation
   - Install the skill(s) according to your AI assistant's documentation.

## Session-Based Architecture

The MCP server uses a **stateful, session-based architecture** where each client connection maintains a persistent session for its lifetime.

### How Sessions Work

When a client first connects, it sends an `initialize` request without a session ID. The server:

1. Creates a new, isolated server instance for the session
2. Assigns a unique session ID (UUID)
3. Returns the session ID in the response

All subsequent requests from that client include an `mcp-session-id` header, which routes them to the correct server instance.

```
Client                              MCP Server
  │                                    │
  ├─► POST /mcp (initialize)           │
  │   (no mcp-session-id header)       │
  │                                    ├─ Create new server+transport pair
  │                                    ├─ Assign session ID
  │   ◄── Response: mcp-session-id ────┤
  │                                    │
  ├─► POST /mcp (list tools)           │
  │   mcp-session-id: <session-id>     │
  │                                    ├─ Look up existing session
  │   ◄── Tool list ───────────────────┤
  │                                    │
  ├─► POST /mcp (call tool)            │
  │   mcp-session-id: <session-id>     │
  │                                    ├─ Reuse same session (no reconnect)
  │   ◄── Tool result ─────────────────┤
```

### Parallel Request Safety

Parallel requests are handled safely under the session model:

- **Within the same session**: Requests are queued by the transport layer and processed in order — no race conditions.
- **Across different sessions**: Each session has its own isolated server instance — no interference between clients.

This resolves a critical bug in the previous stateless implementation where concurrent requests could corrupt server state or return results to the wrong client.

### MCP Apps and Notifications

The session-based architecture enables capabilities that require persistent connections:

- **Server-to-client notifications** — the server can push progress updates and log messages to clients during long-running operations.
- **MCP Apps** — interactive UI components that require a persistent session to function.

These capabilities are available once a session is established and the client supports them.

### Session Lifecycle

- **Session creation**: On the first `initialize` request from a client.
- **Session reuse**: All subsequent requests from the same client include the session ID and reuse the existing connection.
- **Session cleanup**: When the client disconnects, the session and its resources are automatically freed.
- **Server shutdown**: All active sessions are cleanly closed when the extension deactivates or the MCP server is stopped.

### Multiple Concurrent Sessions

Each IDE or AI assistant that connects gets its own isolated session. For example, VS Code Copilot and Windsurf can both be connected simultaneously without interfering with each other. Each has its own server instance and tool execution context.

## Troubleshooting Sessions

### Session Not Found (404)

**Symptom**: The MCP server returns a `404` error with a message about the session not being found.

**Causes**:

- The session expired or was cleaned up (e.g., after extension restart or VS Code reload).
- The client is sending a stale session ID from a previous connection.

**Resolution**: Restart the AI assistant session or MCP client. Most clients will automatically re-initialize and obtain a new session ID.

### Session Initialization Failures (400)

**Symptom**: Requests fail with a `400 Bad Request` error.

**Causes**:

- A request was sent without a session ID but was not an `initialize` request.
- The client is not following the MCP session protocol.

**Resolution**: Ensure the client sends an `initialize` request first to establish a session before sending other requests.

### Stale Sessions After Extension Restart

**Symptom**: MCP tools stop responding or return errors after the Deephaven extension restarts.

**Cause**: When the extension restarts, all active sessions are terminated. Clients holding old session IDs will receive errors.

**Resolution**: Restart the AI assistant session or reload the MCP configuration so the client re-initializes with a fresh session.

### Port Changes After Workspace Switch

**Symptom**: MCP connection fails after switching VS Code workspaces.

**Cause**: Each workspace uses an auto-allocated port. Switching workspaces changes the port.

**Resolution**: Check the `MCP:<port>` status bar item for the current port and update your MCP configuration accordingly. You may also need to restart the AI assistant session.

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

The MCP server is designed specifically for VS Code and IDEs built on top of VS Code. See the [IDE-Specific Configuration](#ide-specific-configuration) table above for details on which IDEs require manual configuration.

**Tested and Fully Supported:**

- VS Code with GitHub Copilot
- Windsurf

**Supported with Manual Configuration:**

- Claude in VS Code-based IDEs (VS Code, Cursor, Windsurf, etc.)
- Cursor
- Other VS Code-based IDEs (untested, configuration format may vary)
