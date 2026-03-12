---
name: deephaven-vscode-using
description: Manages Deephaven server connections and code execution through VS Code MCP tools. Handles connecting to DHC/DHE servers, executing Python/Groovy code via runCode/runCodeFromUri, opening variable panels, troubleshooting connection issues, and retrieving server logs. Use when working with the vscode-deephaven extension's MCP tools - NOT for API documentation or query syntax help.
---

# Deephaven VS Code Usage

Guide for working with Deephaven through VS Code MCP tools.

## Key Concepts

**Execution:** Code runs server-side on Deephaven, not locally. Cannot use terminal execution.

**Connections:** `connectionUrl` is optional for `runCode`/`runCodeFromUri`. Omit unless user specifies a server.

**Variables:** Execution responses include variable details. Only call `listVariables` when explicitly requested.

**MCP Tools:** Require `deephaven.mcp.enabled` setting. Enable programmatically if unavailable.

## Core Workflows

### Code Execution

Execute code via:

- `runCode` - ad-hoc code string (Python/Groovy)
- `runCodeFromUri` - workspace file content

**Parameter `connectionUrl` (optional):**

- Omit: Uses default connection
- Specify: When user requests specific server - get URL from `listConnections` or `listServers`

**Response:** Variables (`id`, `title`, `type`), execution time, errors, panel URLs

### Connecting to Servers

**Types:** DHC (Community, local, `localhost:10000`) | DHE (Enterprise, remote)

**Workflow:**

1. `listConnections` - check existing
2. `listServers` - if needed
3. Select server with `isRunning: true`
4. `connectToServer` with exact URL

**Server selection criteria:**

- `isRunning: true` required (false = configured but not started)
- `isConnected` - whether connections exist
- `type` - "DHC" or "DHE"
- `label` - user-friendly name
- Match user intent (local dev vs production)
- DHC: usually `localhost:10000`
- DHE: check environment names in URL/label

### Variable Panels

Panels auto-open after execution. Manual control:

- `listVariables` - list variables on connection
- `openVariablePanels` - open panels (needs `id` and `title` from `listVariables`/`runCode`)

Panel URLs: DHC = `{origin}/iframe/widget/?name={variableTitle}` | DHE = `{origin}/iriside/embed/widget/serial/{serial}/{variableTitle}`

### Remote File Sources

Enable server to fetch source files during execution:

- `addRemoteFileSources` - add folder URIs
- `listRemoteFileSources` - list current sources
- `removeRemoteFileSources` - remove sources

### Troubleshooting

**MCP Server Not Running** (tool doesn't exist, disabled, fetch failed):
Enable `deephaven.mcp.enabled` in workspace settings programmatically.

**Deephaven Server Issues:**
Use `getLogs` (`logType`: "server"/"debug") or `showOutputPanel` (`outputType`: "server"/"debug").

## Common Patterns

**Execute code:** Run `runCode`/`runCodeFromUri` without `connectionUrl` parameter.

**Execute on specific server:** Check `listConnections`, then `listServers` if needed. Pass URL to `connectionUrl`.

**Table data:** Use `variableId` (from `runCode` response) or `tableName` with `getTableData`/`getTableStats`/`getColumnStats`. Only `type === "Table"` variables are valid for `variableId`.

**Troubleshooting:** Check logs with `getLogs` or show output panel with `showOutputPanel`.
