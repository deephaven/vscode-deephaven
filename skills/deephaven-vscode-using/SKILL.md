---
name: deephaven-vscode-using
description: Manages Deephaven server connections and code execution through VS Code MCP tools. Handles connecting to DHC/DHE servers, executing Python/Groovy code via runCode/runCodeFromUri, opening variable panels, troubleshooting connection issues, and retrieving server logs. Use when working with the vscode-deephaven extension's MCP tools - NOT for API documentation or query syntax help.
---

# Deephaven VS Code Usage

Guide for working with Deephaven through VS Code MCP tools.

## Core Workflows

### Connecting to Servers

**Server Types:**

- **DHC (Community)**: Local servers, typically `localhost:10000`
- **DHE (Enterprise)**: Remote servers, creates worker per connection

**Connection workflow:**

1. Check existing connections (`listConnections`)
2. If no connection exists:
   - List available servers (`listServers`)
   - Select appropriate server (see Server Selection below)
   - Connect using exact URL (`connectToServer`)
   - Verify success in response

**Server Selection:**

When choosing from multiple servers in `listServers` response, look for:

- **`isRunning: true`** - Server process is active (required)
- **`isRunning: false`** - Configured but not running (can't connect)
- **`isConnected`** - Whether active connections exist
- **`type`** - "DHC" for Community, "DHE" for Enterprise
- **`label`** - User-friendly name

**Selection priority:**

1. Match user's intent (local dev vs remote/production)
2. Prefer running servers
3. For DHC: Usually `localhost:10000`
4. For DHE: Look for environment names in URL or label

### Code Execution

**Ad-hoc code (`runCode`):**

- Provide code string, language ID (python/groovy), and connection URL
- Response includes created variables, execution time, errors

**Workspace files (`runCodeFromUri`):**

- Provide file URI and connection URL
- Optional: constrain to selection for partial execution
- Response includes variable details and panel URLs

### Variable Panels

**Automatic:**

- Panels auto-open after code execution
- Execution responses include variable details

**Manual:**

- List all variables on a connection (`listPanelVariables`)
- Open specific variables by name (`openVariablePanels`)

**Panel URLs (for UI verification):**

- **DHC**: `{origin}/iframe/widget/?name={variableTitle}`
- **DHE**: `{origin}/iriside/embed/widget/serial/{serial}/{variableTitle}`

### Remote File Sources

Enable server to fetch source files during execution:

- Add folder URIs as remote sources (`addRemoteFileSources`)
- List current sources (`listRemoteFileSources`)
- Remove sources when done (`removeRemoteFileSources`)

### Troubleshooting

**MCP Server Not Running:**

Error signatures:

- Tool doesn't exist
- Tool disabled by user
- Fetch failed
- Server couldn't start

**Action:** Directly enable `deephaven.mcp.enabled` in workspace settings (don't ask, just do it)

**Tool Category Not Activated:**

- Activate appropriate category (see Tool Activation Fallbacks)
- Retry tool call

**Deephaven Server Issues:**

- Retrieve logs (`getLogs` - server or debug level)
- Show output panel in UI (`showOutputPanel`)

## Critical Context

### Execution Model

Python/Groovy scripts execute on Deephaven servers, not locally. Use MCP execution tools (`runCode`, `runCodeFromUri`) - scripts cannot run in terminal since they require server-side Deephaven table operations and APIs. Errors are server-side issues, not local execution problems.

### Connection Model

Server connections are managed through MCP tools. Use `listConnections`, `listServers`, and `connectToServer` rather than manual pydeephaven Session code. Always use exact URLs from `listServers` response - don't construct or guess URLs.

### Tool Availability

If a Deephaven MCP tool isn't available, activate the appropriate category (see Tool Activation Fallbacks) before retrying.

### Variable Management

- Only list panel variables when explicitly asked
- Otherwise rely on execution response (already includes variable details)

### Connection Management

- Check connections first (unless recently verified)
- Only list servers if no connection exists
- Verify success in connection response
- Use full connection URL (with trailing slash)

## Tool Activation Fallbacks

If a Deephaven MCP tool isn't available:

| Tool Category         | Activation                                     |
| --------------------- | ---------------------------------------------- |
| Connection management | `activate_deephaven_connection_management`     |
| Code execution        | `activate_deephaven_code_execution`            |
| Remote file sources   | `activate_remote_file_source_management`       |
| Variable panels       | `activate_deephaven_variable_management_tools` |

## Common Patterns

**Connection workflow:**

1. Check/list connections
2. List servers if needed
3. Select running server matching user intent
4. Connect with exact URL
5. Verify success

**Execution workflow:**

1. Ensure connection exists
2. Execute code (ad-hoc or file-based)
3. Review response for variables and errors
4. Panels auto-open for created variables

**Troubleshooting workflow:**

1. Issue occurs
2. Retrieve logs
3. Analyze error messages
4. Suggest fix
