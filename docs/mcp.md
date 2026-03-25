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

The Deephaven Documentation Searching skill connects to the [Deephaven Docs MCP server](https://deephaven.io/enterprise/docs/clients/mcp/#docs-server). The server is automatically configured for Github Copilot or can be manually configured for other agents as described in [skills installation](#skills-installation). The extension skill makes AI assistants aware of the documentation capabilities. For more information about the Deephaven Docs MCP server itself, see the [official documentation](https://deephaven.io/enterprise/docs/clients/mcp/#docs-server).

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

## Skills

In addition to MCP tools, the extension provides Skills that can be registered with supported AI assistants to provide domain-specific knowledge and capabilities.

### Available Skills

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

### Skills Installation

#### GitHub Copilot (Automatic)

Skills are automatically registered when the extension loads for GitHub Copilot users. No manual installation required.

#### Other Agents (Manual Installation)

For other AI agents, you'll need to manually install the skills.

**Installation Options:**

1. **Using `npx skills` (recommended if you have Node.js installed):**

   ```bash
   npx skills add deephaven/vscode-deephaven -g -s deephaven-vscode-using
   npx skills add deephaven/vscode-deephaven -g -s deephaven-docs-searching
   ```

2. **Manual installation:**
   - Navigate to the [skills folder](https://github.com/deephaven/vscode-deephaven/tree/main/skills) in the vscode-deephaven repository
   - Download the `SKILL.md` file from each skill you want to use:
     - [deephaven-vscode-using/SKILL.md](https://github.com/deephaven/vscode-deephaven/tree/main/skills/deephaven-vscode-using/SKILL.md) - For interacting with Deephaven through the VS Code extension's MCP tools
     - [deephaven-docs-searching/SKILL.md](https://github.com/deephaven/vscode-deephaven/tree/main/skills/deephaven-docs-searching/SKILL.md) - For querying Deephaven documentation
   - Install the skill(s) according to your AI assistant's documentation

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
