# MCP Tool Guide

This guide helps you understand what the Deephaven MCP tools can do and how to use them effectively with AI assistants like GitHub Copilot.

> **Note:** The AI assistant can see the full tool schemas automatically. This guide focuses on when and how to use each tool.

## Quick Reference

| Category                | Tools                                                                      | Purpose                                |
| ----------------------- | -------------------------------------------------------------------------- | -------------------------------------- |
| **Server Management**   | `connectToServer`, `listServers`                                           | Connect to and list configured servers |
| **Connections**         | `listConnections`                                                          | Check active connections               |
| **Code Execution**      | `runCode`, `runCodeFromUri`                                                | Execute Python/Groovy code             |
| **Variables**           | `listVariables`, `openVariablePanels`                                      | Query and interact with variables      |
| **Table Data & Stats**  | `getTableData`, `getTableStats`, `getColumnStats`                          | Fetch and analyze table data           |
| **Remote File Sources** | `addRemoteFileSources`, `listRemoteFileSources`, `removeRemoteFileSources` | Manage server file source paths        |
| **Logging**             | `getLogs`, `showOutputPanel`                                               | Access and view logs                   |

## Server Management

### Listing and Connecting to Servers

**Use `listServers`** to see what Deephaven servers are configured in your VS Code settings. This is useful when you need to check server status or see what's available.

**Use `connectToServer`** to create a connection to a configured server. You need a connection before you can run code.

**Common patterns:**

```
"Connect to my Deephaven localhost" → AI uses listServers to find it, then connectToServer
"Connect to my analytics DH server" → AI uses listServers to match a server label containing "analytics", then connectToServer
"What servers do I have configured?" → AI uses listServers
"Is my Deephaven server running?" → AI uses listServers to check status
```

**Notes:**

- Servers must be configured in VS Code settings first (see [Configuration](configuration.md)).
- Community servers auto-start if they're pip-managed.
- The AI can find servers by URL or label when connecting.
- Connecting to Enterprise servers creates a new worker.

## Running Code

### Execute Code Snippets or Files

**Use `runCode`** when you want to execute code directly (like "run this Python snippet").

**Use `runCodeFromUri`** when working with files in your workspace (like "run this file" or "run lines 10-20").

**Auto-connection:** If you're not connected, `runCode` will try to connect automatically to a running server.

**Common patterns:**

```
"Create a table with 1000 rows" → AI generates code and uses runCode
"Run a Python script to create a simple ticking table" → AI generates code and uses runCode
"Run my analysis.py file" → AI uses runCodeFromUri
"Execute just the data loading part" → AI uses runCodeFromUri with selection
```

**Notes:**

- Language is detected from the file extension or specified explicitly.
- Variables created by the code are returned in the response.

## Checking Connections

### See What's Connected

**Use `listConnections`** to see active connections and their status.

**Common patterns:**

```
"What Deephaven connections are active?" → AI uses listConnections
"Is my DH server still connected?" → AI uses listConnections with URL filter
"Run this against my acme-server connection" → AI uses listConnections to find the URL for "acme-server"
```

**Useful for:**

- Debugging connection issues.
- Checking if code is currently running.
- Resolving connection names to URLs.

## Working with Variables

### List and Open Variable Panels

**Use `listVariables`** to see all panel variables available on a connection. This returns variable metadata including IDs, titles, and types.

**Use `openVariablePanels`** to open UI panels for specific variables (tables, plots, etc.). Requires variable objects with both `id` and `title` from `listVariables` or code execution responses.

**Common patterns:**

```
"What variables are available?" → AI uses listVariables
"Show me all the tables" → AI uses listVariables, filters by type "Table"
"Open the sales_data table" → AI uses listVariables to find it, then openVariablePanels
"Reopen the panels I closed earlier" → AI uses listVariables to find variables, then openVariablePanels
```

**Notes:**

- Variables are automatically opened as panels after code execution, so `openVariablePanels` is typically used to reopen panels that were closed or for variables that weren't initially opened.
- `listVariables` only returns variables that support panels (tables, plots, etc.), not scalar values or functions.
- Panel URLs are included in responses for UI verification.

## Table Data & Statistics

### Fetch and Analyze Table Data

**Use `getTableData`** to fetch paginated data from a table. Returns actual row data with configurable limit and offset for pagination.

**Use `getTableStats`** to get schema information and basic statistics like row count, column names, types, and descriptions.

**Use `getColumnStats`** to get detailed statistics for a specific column (min, max, average, unique values, etc.).

**Common patterns:**

```
"Show me the first 10 rows" → AI uses getTableData with limit=10
"What columns are in this table?" → AI uses getTableStats
"Get statistics for the price column" → AI uses getColumnStats with columnName="price"
"How many rows are in my table?" → AI uses getTableStats (includes rowCount)
"What's the average value in the sales column?" → AI uses getColumnStats
```

**Notes:**

- Prefer `variableId` (from `runCode` or `listVariables`) over `tableName` when available.
- `getTableData` supports pagination via `limit` and `offset` parameters (max 10,000 rows per request).
- Statistics are computed on-demand and may take time for large tables.
- All tools work with both static and ticking (real-time) tables.

## Remote File Sources

### Manage Server File Paths

Remote file sources allow the Deephaven server to access source files during code execution (e.g., for Python imports or file reading).

**Use `addRemoteFileSources`** to add workspace folders as remote file sources on a connection.

**Use `listRemoteFileSources`** to see which folders are currently registered as remote file sources.

**Use `removeRemoteFileSources`** to unregister folders when they're no longer needed.

**Common patterns:**

```
"Add my workspace folder as a remote source" → AI uses addRemoteFileSources
"What remote file sources are configured?" → AI uses listRemoteFileSources
"Remove the old data folder from sources" → AI uses removeRemoteFileSources
"Let the server access my local Python modules" → AI uses addRemoteFileSources
```

**Useful for:**

- Enabling server-side Python imports from local files.
- Allowing Deephaven to read data files from your workspace.
- Setting up development workflows with local code.

**Notes:**

- Only works with Enterprise (DHE) servers.
- Folders must be within the workspace.
- Files are synced to the server when registered.

## Accessing Logs

### View Extension Output

**Use `getLogs`** to retrieve log history programmatically. Specify `"server"` for server logs or `"debug"` for detailed diagnostics.

**Use `showOutputPanel`** to open the VS Code Output panel in the UI.

**Common patterns:**

```
"Show me the server logs" → AI uses getLogs with logType="server"
"What errors happened?" → AI uses getLogs with logType="debug"
"Open the output panel" → AI uses showOutputPanel
```

**Useful for:**

- Debugging connection issues.
- Investigating code execution errors.
- Seeing what happened during operations.

## Getting Help

If tools aren't working as expected:

1. Use `getLogs` to see what errors occurred.
2. Verify your server configuration in VS Code settings.
3. Check that the MCP server is enabled (`deephaven.mcp.enabled`).
4. Check the VS Code Output panel (View → Output → Deephaven) for error messages.
