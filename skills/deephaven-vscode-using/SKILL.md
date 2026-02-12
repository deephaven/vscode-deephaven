---
name: deephaven-vscode-using
description: Specialized agent for working with Deephaven real-time analytics platform. Manages server connections, executes Python/Groovy queries, opens variable panels, troubleshoots issues, and provides documentation assistance through VS Code MCP tools. Use when users need to connect to Deephaven servers, run queries, visualize tables/plots, or get help with Deephaven APIs.
---

# Deephaven VS Code Usage

Guide for working with Deephaven through VS Code MCP tools.

## Core Workflows

### Connecting to Servers

**Server Types:**

- **DHC (Deephaven Community)**: Local development servers, simpler architecture
  - Typical URL: `http://localhost:10000/`
  - Single persistent worker, single connection per server
- **DHE (Deephaven Enterprise)**: Remote production servers with worker management
  - Typical URLs: `https://server.int.company.com:8123/` or `:8000/`
  - Creates new worker per connection

**Standard connection flow:**

1. Check existing connections: `mcp_deephaven_vs__listConnections`
2. If no connection exists:
   - List available servers: `mcp_deephaven_vs__listServers`
   - Select appropriate server (see Server Selection below)
   - Connect: `mcp_deephaven_vs__connectToServer` with exact URL from list
3. Verify connection: Call `listConnections` to confirm `isConnected: true`

**Skip step 1 if connections recently checked and remembered.**

**Server Selection:**

When choosing from multiple servers in `listServers` response, look for:

- **`isRunning: true`** - Server process is active (required for connection)
- **`isRunning: false`** - Server is configured but not running (can't connect)
- **`isConnected: true/false`** - Whether active connections exist
- **`connectionCount`** - Number of existing connections
- **`type`** - "DHC" for Community, "DHE" for Enterprise
- **`label`** - User-friendly name (e.g., "Local Dev", "Production")

**Selection priority:**

1. Match user's intent (local dev vs remote/production)
2. Prefer `isRunning: true` servers
3. For DHC: Usually `localhost:10000` (default dev server)
4. For DHE: Look for specific environment names in URL or label

**Common server patterns:**

- Local development: `http://localhost:10000/` (DHC)
- Alternative local: `http://localhost:10011/` (DHC with custom config)
- Enterprise dev: `https://<username>-<env>.int.company.com:8123/` or `:8000/`

### Executing Code

**For ad-hoc Python/Groovy code:**

```typescript
mcp_deephaven_vs__runCode({
  code: "from deephaven import time_table\nt = time_table('PT1S').head(100)",
  languageId: 'python', // or "groovy"
  connectionUrl: 'http://localhost:10000/', // from listConnections/listServers
});
```

**For workspace files:**

```typescript
mcp_deephaven_vs__runCodeFromUri({
  uri: '/absolute/path/to/script.py',
  connectionUrl: 'http://localhost:10000/',
  constrainTo: 'selection', // optional - execute only selected code
});
```

**Execution responses include:**

- Created/updated variable info (id, title, type)
- Execution time
- Any output or errors
- Panel URL format for constructing UI links

### Variable Panels

**Automatic behavior:**

- Panels auto-open after code execution
- `runCode`/`runCodeFromUri` responses include variable details

**Manual operations:**

List all variables on connection:

```typescript
mcp_deephaven_vs__listPanelVariables({ connectionUrl });
```

Open specific variables in panels:

```typescript
mcp_deephaven_vs__openVariablePanels({
  connectionUrl,
  variables: ['table_name', 'plot_name'],
});
```

**Panel URLs for UI verification (e.g., with Chrome MCP):**

- **Community (DHC)**: `${url.origin}/iframe/widget/?name=<variableTitle>`
  - Example: `http://localhost:10000/iframe/widget/?name=my_table`
- **Enterprise (DHE)**: `${url.origin}/iriside/embed/widget/serial/${serial}/<variableTitle>`
  - Example: `https://server.com:8000/iriside/embed/widget/serial/1769789248592000159/my_table`
  - Get `serial` from `querySerial` in connection info or execution response's `panelUrlFormat`

### Remote File Sources

Enable server to fetch source files on-demand during script execution:

```typescript
// Add folders as remote file sources
mcp_deephaven_vs__addRemoteFileSources({
  folderUris: ['/absolute/path/to/folder'],
});

// List current remote file sources
mcp_deephaven_vs__listRemoteFileSources();

// Remove remote file sources
mcp_deephaven_vs__removeRemoteFileSources({
  folderUris: ['/absolute/path/to/folder'],
});
```

### Troubleshooting

**MCP Server Not Running:**

**Error signatures:**
- `Error sending message to http://localhost:XXXXX/mcp: TypeError: fetch failed`
- `MCP server could not be started`

**Agent response pattern:**
When encountering these errors, prompt the user:
> "The Deephaven MCP server isn't running. Please click the Deephaven status bar item to start it, then I can retry."

After user confirms, retry the tool call.

**Tool Not Available (Different Issue):**

If error is "tool not found" (not fetch failed):
1. Activate appropriate tool category (see Tool Activation Fallbacks)
2. Retry tool call

**Deephaven Server Issues:**

**Retrieve logs:**

```typescript
mcp_deephaven_vs__getLogs({
  logType: 'server', // or "debug" for detailed diagnostics
});
```

**Show output panel in UI:**

```typescript
mcp_deephaven_vs__showOutputPanel({
  outputType: 'server', // or "debug"
});
```

### Documentation Queries

For API details, syntax, or best practices:

```typescript
mcp_deephaven_doc_docs_chat({
  prompt: 'How do I join two tables?',
  programming_language: 'python', // or "groovy"
  deephaven_core_version: '0.35.1', // optional
  history: [
    // optional for follow-up questions
    { role: 'user', content: '...' },
    { role: 'assistant', content: '...' },
  ],
});
```

## Critical Rules

### Tool Usage

1. **NEVER run Python/Groovy scripts via terminal against Deephaven servers** - Always use MCP tools (`runCode` or `runCodeFromUri`)
2. **NEVER attempt manual server connections** - Always use `connectToServer`
3. **ALWAYS use exact URLs from listServers** - Don't guess or construct URLs
4. **Activate tool categories if tools unavailable:**
   - `activate_deephaven_connection_management` → connection tools
   - `activate_deephaven_code_execution` → execution tools
   - `activate_remote_file_source_management` → file source tools
   - `activate_deephaven_variable_management_tools` → variable panel tools

### Variable Management

- Only call `listPanelVariables` when user explicitly asks "what variables exist?"
- Otherwise, rely on execution response variables (already includes created/updated variables)

### Connection Management

- Check connections first (unless recently done)
- Only list servers if no connection exists
- Verify connection succeeded after `connectToServer` by calling `listConnections`
- Use full connection URL (with trailing slash) in all execution calls

## Tool Activation Fallbacks

If a Deephaven tool isn't available:

| Missing Tool Category | Activation Call                                |
| --------------------- | ---------------------------------------------- |
| Connection management | `activate_deephaven_connection_management`     |
| Code execution        | `activate_deephaven_code_execution`            |
| Remote file sources   | `activate_remote_file_source_management`       |
| Variable panels       | `activate_deephaven_variable_management_tools` |

After activation, retry the original tool call.

## Example Workflows

**Connect and execute (simple case - one running server):**

```
1. listConnections → No active connections
2. listServers → Find running server at http://localhost:10000/ (isRunning: true)
3. connectToServer({ url: "http://localhost:10000/" })
4. listConnections → Verify isConnected: true
5. runCode({
     code: "t = time_table('PT1S').head(100)",
     languageId: "python",
     connectionUrl: "http://localhost:10000/"
   })
6. Variables auto-displayed → Report success with variable names
```

**Connect and execute (multiple servers - need selection):**

```
1. listConnections → No active connections
2. listServers → Multiple servers found:
   - Local Dev (DHC, http://localhost:10000/, isRunning: true)
   - Production (DHE, https://prod.company.com:8000/, isRunning: true)
   - Old Dev (DHC, http://localhost:10011/, isRunning: false)
3. Select based on user intent ("my running server" → Local Dev)
4. connectToServer({ url: "http://localhost:10000/" })
5. listConnections → Verify connection
6. Proceed with execution...
```

**Execute workspace file:**

```
1. Check connection exists (skip if known)
2. runCodeFromUri({
     uri: "/workspace/queries/analysis.py",
     connectionUrl: "http://localhost:10000/"
   })
3. Report results from response
```

**Troubleshoot connection failure:**

```
1. Connection fails
2. getLogs({ logType: "server" })
3. Analyze logs
4. Report issue + suggested fix
```

## What NOT to Do

❌ Don't provide pydeephaven Session code for manual connections  
❌ Don't run `python script.py` for Deephaven code  
❌ Don't guess server URLs  
❌ Don't manually manage auth/credentials  
❌ Don't edit server configuration files manually  
❌ Don't skip connection verification after `connectToServer`

## Progress Reporting

Keep users informed:

- **Starting**: "Connecting to Local Dev..."
- **During**: "Executing Python code..."
- **Success**: "✅ Code executed (234ms). Created variables: my_table, result_df"
- **Failure**: "❌ Execution failed: [error]. Check logs?"

## When to Ask

- No servers configured: "No Deephaven servers found. Need help setting one up?"
- Multiple running servers: "Found multiple running servers. Connect to Local Dev (localhost) or Production?"
- Connection fails: "Connection failed. Should I check server logs?"
- Code errors: "Code failed with [error]. Want me to check documentation for correct syntax?"
- Ambiguous intent: "Did you mean DHC (Community) or DHE (Enterprise)?"
