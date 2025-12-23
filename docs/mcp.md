# Deephaven VS Code MCP Server (experimental)

## MCP Tools

The extension provides 17 MCP tools for interacting with Deephaven servers:

### Server & Connection Management
- **connectToServer** - Create a connection to a Deephaven server
- **listConnections** - List all active Deephaven connections
- **listServers** - List all Deephaven servers with optional filtering
- **setEditorConnection** - Set connection for an editor by URI
- **startPipServer** - Start a managed Deephaven pip server

### Code Execution
- **runCode** - Execute arbitrary code text in a Deephaven session
- **runCodeFromUri** - Execute code from a workspace file URI

### Table Operations
- **getColumnStats** - Get statistical information for a table column
- **getTableStats** - Get schema and statistics for a table
- **queryTableData** - Query table data with filters, aggregations, and sorting

### Panel & Variable Management
- **listPanelVariables** - List panel variables for a connection
- **openVariablePanels** - Open variable panels for a connection

### Workspace & File Management
- **addRemoteFileSources** - Add remote file source folders to the workspace
- **openFilesInEditor** - Open files in VS Code editor

### Diagnostics & Utilities
- **checkPythonEnvironment** - Check if Python environment supports Deephaven pip server
- **getLogs** - Get log history from debug output channel
- **showOutputPanel** - Show Deephaven output panel in VS Code

## Installation

For VS Code and Windsurf, you can manually download and install the latest mcp-dev .vsix:

   [vscode-deephaven-1.1.10-mcp-dev.0.vsix](https://github.com/deephaven/vscode-deephaven/raw/refs/heads/mcp/releases/vscode-deephaven-1.1.10-mcp-dev.0.vsix)

### VS Code
- Download and install the .vsix
- Restart VS Code
- A toast message should say that Deephaven MCP Server has started
- No need to configure anything. Copilot should now have access to the MCP server

### Windsurf
- Download and install the .vsix
- Restart Windsurf
- Should see a prompt "Your Windsurf MCP config doesn't match this workspace's 'Deephaven VS Code MCP Server'. Update to port XXXXX?"
- Say "yes" for this time or "always" for it to automatically update when you switch windows

> Note Windsurf only supports a global mcp server configuration (`~/.codeium/windsurf/mcp_config.json`), but the extension assigns a unique MCP port to each workspace. This means whenever you switch workspaces, you will be prompted to sync the port again so that Cascade can talk to the correct MCP server.