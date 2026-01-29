# MCP Tool Guide

This guide helps you understand what the Deephaven MCP tools can do and how to use them effectively with AI assistants like GitHub Copilot.

> **Note:** The AI assistant can see the full tool schemas automatically. This guide focuses on when and how to use each tool.

## Quick Reference

| Category              | Tools                                                              | Purpose                                |
| --------------------- | ------------------------------------------------------------------ | -------------------------------------- |
| **Server Management** | `connectToServer`, `listServers`                                   | Connect to and list configured servers |
| **Connections**       | `listConnections`                                                  | Check active connections               |
| **Code Execution**    | `runCode`, `runCodeFromUri`                                        | Execute Python/Groovy code             |
| **Logging**           | `getLogs`, `showOutputPanel`                                       | Access and view logs                   |

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

**Important notes:**

- Servers must be configured in VS Code settings first (see [Configuration](configuration.md))
- Community servers auto-start if they're pip-managed
- The AI can find servers by URL or label when connecting
- Connecting to Enterprise servers creates a new worker

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

**Important notes:**

- Language is detected from file extension or specified explicitly
- Variables created by the code are returned in the response

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

- Debugging connection issues
- Checking if code is currently running
- Resolving connection names to URLs

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

- Debugging connection issues
- Investigating code execution errors
- Seeing what happened during operations

## Getting Help

If tools aren't working as expected:

1. Use `getLogs` to see what errors occurred
2. Verify your server configuration in VS Code settings
3. Check that the MCP server is enabled (`deephaven.mcp.enabled`)
4. Check the VS Code Output panel (View → Output → Deephaven) for error messages
