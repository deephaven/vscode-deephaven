# MCP Integration Design Document

**Version:** 1.0  
**Date:** November 12, 2025  
**Status:** Draft

## Executive Summary

This document outlines the design for integrating a Model Context Protocol (MCP) server into the Deephaven VS Code extension. The MCP server will expose the extension's capabilities as tools that AI assistants (like GitHub Copilot, Claude, etc.) can use to interact with Deephaven servers programmatically.

## Background

### Current Architecture

The VS Code Deephaven extension currently provides:
- **Server Management**: Connect to DHC (Community) and DHE (Enterprise) servers
- **Managed Pip Servers**: Start/stop local Deephaven servers
- **Query Execution**: Run Python/Groovy scripts against servers
- **Panel Management**: View and interact with Deephaven tables/panels
- **Credential Management**: Handle authentication (PSK, password, SAML, key pairs)
- **Workspace Integration**: Code lenses, drag-and-drop, file system support

### MCP Overview

The Model Context Protocol (MCP) is a standardized protocol for AI assistants to interact with external tools and data sources. An MCP server exposes:
- **Tools**: Functions that can be called by AI assistants
- **Resources**: Data that can be read by AI assistants
- **Prompts**: Pre-defined prompt templates

### Reference Implementation

The existing `deephaven-mcp` project (at `/Users/bingles/code/tools/deephaven-mcp`) provides:
- **Session Management Tools**: Connect to, query, and manage Deephaven sessions
- **Configuration-based Setup**: JSON configuration for defining available sessions
- **Documentation Server**: Remote MCP server for Deephaven documentation

## Goals

### Primary Goals

1. **Expose Extension Capabilities**: Make VS Code extension functionality available to AI assistants
2. **Seamless Integration**: Leverage existing extension services without duplication
3. **User Context Awareness**: Provide AI assistants with context about the user's current workspace
4. **Server State Management**: Allow AI assistants to query and manipulate server connections

### Secondary Goals

1. **Developer Experience**: Make it easy for AI assistants to help users write Deephaven code
2. **Discoverability**: Help AI assistants understand what Deephaven servers and resources are available
3. **Security**: Ensure credentials and sensitive data are handled securely
4. **Performance**: Minimize overhead of MCP operations

### Non-Goals

1. **Replace UI**: MCP is supplemental to the existing UI, not a replacement
2. **Public API**: This is not a public API for the extension
3. **Breaking Changes**: Should not require changes to existing extension functionality

## MVP Scope

The Minimum Viable Product (MVP) will focus on a core set of functionality that enables AI assistants to effectively help users work with Deephaven servers. The MVP prioritizes **discoverability** (what's available) and **execution** (running code) while keeping implementation scope manageable.

### MVP Features

#### 1. Script Execution
**Goal**: Enable AI assistants to execute Deephaven scripts on behalf of users.

**Key Requirements**:
- Execute scripts from **any file path in the workspace** (not just active editor)
- Support both Python and Groovy scripts
- Leverage existing extension execution infrastructure (which handles connection prompts)
- Return execution results or errors

**Tools**:
```typescript
// Execute a script file by path
tool: "deephaven.executeFile"
params: {
  filePath: string;  // Absolute or workspace-relative path
}
returns: {
  success: boolean;
  output?: string;
  error?: string;
}

// Execute arbitrary script content on the active connection
tool: "deephaven.executeScript"
params: {
  script: string;
  consoleType: "python" | "groovy";
}
returns: {
  success: boolean;
  output?: string;
  error?: string;
}
```

**Behavior**:
- `executeFile`: Uses the extension's existing file execution logic
  - If file has no associated server connection, prompts user to select one (same as UI)
  - Once connected, file association is persisted until explicitly changed
  - Language is auto-detected from file extension
- `executeScript`: Executes on the currently active connection
  - Requires an active connection (returns error if none)
  - AI assistant should use `listConnections` to verify active connection first
- All connection management (prompts, authentication) handled by existing extension infrastructure

**Use Cases**:
- "Run this Python file against a server" (extension prompts for server selection if needed)
- "Execute the query in src/analysis.py and show me the results"
- "Run this code snippet on the current connection"

#### 2. Server Discovery & Status
**Goal**: Allow AI assistants to discover available servers and check their connection status.

**Tools**:
```typescript
// List all configured servers
tool: "deephaven.listServers"
returns: {
  servers: Array<{
    type: "DHC" | "DHE";
    url: string;
    label?: string;
    isConnected: boolean;
    isRunning: boolean;
    isManaged: boolean;
    connectionCount: number;
  }>
}

// Get detailed status for a specific server
tool: "deephaven.getServerStatus"
params: { serverUrl: string }
returns: {
  type: "DHC" | "DHE";
  url: string;
  isConnected: boolean;
  isRunning: boolean;
  isManaged: boolean;
  connectionCount: number;
  workers?: Array<{
    id: string;
    url: string;
    language: "python" | "groovy";
  }>;
}

// List active connections
tool: "deephaven.listConnections"
returns: {
  connections: Array<{
    serverUrl: string;
    isConnected: boolean;
    isRunningCode: boolean;
  }>
}
```

**Use Cases**:
- "Which Deephaven servers are currently running?"
- "Is the production server connected?"
- "Show me all active connections"

#### 3. Panel Discovery
**Goal**: Allow AI assistants to discover what tables and panels are available on connected servers.

**Tools**:
```typescript
// List all available panels on a server
tool: "deephaven.listPanels"
params: { serverUrl: string }
returns: {
  panels: Array<{
    id: string;
    title: string;
    type: string;  // "table", "figure", "widget", etc.
    serverUrl: string;
  }>
}

// Get table schema/metadata
tool: "deephaven.getTableSchema"
params: {
  serverUrl: string;
  panelId: string;
}
returns: {
  columns: Array<{
    name: string;
    type: string;
  }>;
  size?: number;
  isStatic: boolean;
}
```

**Use Cases**:
- "What tables are available on the dev server?"
- "Show me the schema for the 'trades' table"
- "List all the panels I created in my last session"

#### 4. Panel Opening
**Goal**: Allow AI assistants to open/display panels in the VS Code UI.

**Tools**:
```typescript
// Open a panel in VS Code
tool: "deephaven.openPanel"
params: {
  serverUrl: string;
  panelId: string;
}
returns: {
  success: boolean;
  error?: string;
}

// Open multiple panels
tool: "deephaven.openPanels"
params: {
  serverUrl: string;
  panelIds: string[];
}
returns: {
  success: boolean;
  opened: string[];  // Successfully opened panel IDs
  failed: string[];  // Failed panel IDs
  errors?: Record<string, string>;  // Errors by panel ID
}
```

**Use Cases**:
- "Open the 'trades' table so I can see the data"
- "Show me the last 3 tables I created"
- "Open all the plot panels from the analysis script"

### MVP Out of Scope

The following features are **NOT** included in the MVP but may be added in later phases:

- ❌ Explicit connection management (connect/disconnect) - users manage via UI/prompts
- ❌ Table data sampling - can be added later if needed
- ❌ Managed pip server control - focus on existing servers first
- ❌ Workspace file discovery - can be added for better context
- ❌ Editor context awareness - AI can rely on user providing file paths
- ❌ MCP resources - tools are sufficient for MVP
- ❌ MCP prompts - can be added based on usage patterns

### Connection Management Strategy

**Leverage Existing Extension Behavior**:
- Script execution uses the extension's existing connection logic
- When executing a file without an associated connection, extension prompts user to select server
- File-to-server associations are persisted by the extension
- No need for explicit connection management tools in MVP
- Keeps AI assistant interactions simple and consistent with UI behavior

**Implementation Notes**:
- MCP tools call the same execution methods as UI commands
- All connection prompts, authentication, and state management handled by existing code
- No duplication of connection logic

### MVP Success Criteria

The MVP will be considered successful when:

1. ✅ AI assistants can discover available Deephaven servers
2. ✅ AI assistants can execute scripts (leveraging extension's connection prompts)
3. ✅ AI assistants can list available tables/panels
4. ✅ AI assistants can open panels for the user to view
5. ✅ All operations work via extension infrastructure (no code duplication)
6. ✅ Connection management handled by existing extension logic (prompts, file associations)
7. ✅ Error handling provides useful feedback to AI assistants
8. ✅ Basic documentation enables users to configure and use MCP

### MVP Implementation Plan

The MVP focuses on the core infrastructure and the 4 essential feature areas:

**Week 1: Core Infrastructure**
- Set up `MCPServerController` and MCP server lifecycle
- Implement stdio transport and request routing
- Add basic error handling and logging
- Create configuration schema

**Week 2: Server Discovery & Status**
- Implement `listServers` tool
- Implement `getServerStatus` tool
- Implement `listConnections` tool
- Add integration tests

**Week 3: Script Execution**
- Implement `executeFile` tool (delegates to extension's existing file execution)
- Implement `executeScript` tool (executes on active connection)
- Add file path resolution (absolute & workspace-relative)
- Test with extension's connection prompts and file associations
- Add integration tests

**Week 4: Panel Discovery & Opening**
- Implement `listPanels` tool
- Implement `getTableSchema` tool
- Implement `openPanel` tool
- Implement `openPanels` tool
- Add integration tests

**Week 5: Documentation & Testing**
- Write MVP user documentation
- Create example configurations
- Perform end-to-end testing with GitHub Copilot
- Fix bugs and polish based on testing
- Prepare for initial release

### Post-MVP Roadmap

After the MVP is validated, consider adding:

1. **Enhanced Query Results**: Return sample data from executed queries
2. **Connection Management**: Allow AI to connect/disconnect servers
3. **Managed Servers**: Control pip-installed Deephaven servers
4. **Workspace Context**: Provide file discovery and editor state
5. **Advanced Panel Operations**: Filter, sort, and query tables
6. **Streaming Support**: Handle ticking tables and real-time updates

## Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────────┐
│                    VS Code Extension                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              ExtensionController                        │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │ │
│  │  │ServerManager │  │PanelService  │  │ConfigService │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘ │ │
│  └────────────────────────────────────────────────────────┘ │
│                            │                                 │
│                            │ Internal API                    │
│                            ▼                                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              MCPServerController (NEW)                  │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │         MCP Server Implementation                 │  │ │
│  │  │  - Tool Handlers                                  │  │ │
│  │  │  - Resource Providers                             │  │ │
│  │  │  - Context Adapters                               │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ MCP Protocol (stdio)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      AI Assistant                            │
│              (GitHub Copilot, Claude, etc.)                  │
└─────────────────────────────────────────────────────────────┘
```

### Component Design

#### 1. MCPServerController

**Responsibility**: Manage the lifecycle of the MCP server within the extension.

**Key Methods**:
```typescript
class MCPServerController implements IDisposable {
  constructor(
    context: vscode.ExtensionContext,
    serverManager: IServerManager,
    panelService: IPanelService,
    configService: IConfigService,
    outputChannel: vscode.OutputChannel
  );
  
  // Initialize and start the MCP server
  initialize(): Promise<void>;
  
  // Handle MCP requests
  handleRequest(request: MCPRequest): Promise<MCPResponse>;
  
  // Shutdown
  dispose(): void;
}
```

**Implementation Details**:
- Created during `ExtensionController.activate()`
- Listens for MCP requests via stdio or socket
- Routes requests to appropriate tool handlers
- Manages MCP server lifecycle

#### 2. MCP Tool Handlers

Tool handlers expose extension functionality as MCP tools.

##### Server Management Tools

```typescript
// List all configured servers
tool: "deephaven.listServers"
returns: {
  servers: Array<{
    type: "DHC" | "DHE";
    url: string;
    label?: string;
    isConnected: boolean;
    isRunning: boolean;
    isManaged: boolean;
  }>
}

// Connect to a server
tool: "deephaven.connectToServer"
params: { serverUrl: string, consoleType?: "python" | "groovy" }
returns: { success: boolean, connectionId: string }

// Disconnect from a server
tool: "deephaven.disconnectFromServer"
params: { serverUrl: string }
returns: { success: boolean }

// Get server status
tool: "deephaven.getServerStatus"
params: { serverUrl: string }
returns: {
  isConnected: boolean;
  isRunning: boolean;
  connectionCount: number;
  workers?: Array<WorkerInfo>;
}
```

##### Query Execution Tools

```typescript
// Execute a script on a server
tool: "deephaven.executeScript"
params: {
  serverUrl: string;
  script: string;
  consoleType: "python" | "groovy";
}
returns: {
  success: boolean;
  output?: string;
  error?: string;
}

// Execute the current file
tool: "deephaven.executeCurrentFile"
params: { serverUrl: string }
returns: { success: boolean }

// Execute selected text
tool: "deephaven.executeSelection"
params: {
  serverUrl: string;
  text: string;
  consoleType: "python" | "groovy";
}
returns: { success: boolean }
```

##### Panel/Table Discovery Tools

```typescript
// List available panels
tool: "deephaven.listPanels"
params: { serverUrl: string }
returns: {
  panels: Array<{
    id: string;
    title: string;
    type: string; // "table", "plot", etc.
  }>
}

// Get table schema
tool: "deephaven.getTableSchema"
params: { serverUrl: string, panelId: string }
returns: {
  columns: Array<{
    name: string;
    type: string;
  }>
}

// Sample table data
tool: "deephaven.sampleTableData"
params: {
  serverUrl: string;
  panelId: string;
  maxRows?: number;
}
returns: {
  data: Array<Record<string, any>>;
  rowCount: number;
}
```

##### Workspace Context Tools

```typescript
// Get active editor context
tool: "deephaven.getEditorContext"
returns: {
  activeFile?: {
    path: string;
    language: string;
    content?: string;
    selection?: string;
  };
  workspaceRoot?: string;
}

// Get workspace Deephaven files
tool: "deephaven.listWorkspaceFiles"
params: { fileType?: "python" | "groovy" | "all" }
returns: {
  files: Array<{
    path: string;
    language: string;
  }>
}
```

##### Managed Server Tools

```typescript
// Start a managed pip server
tool: "deephaven.startPipServer"
params: { port?: number }
returns: {
  success: boolean;
  serverUrl: string;
  port: number;
}

// Stop a managed pip server
tool: "deephaven.stopPipServer"
params: { serverUrl: string }
returns: { success: boolean }

// Get pip server status
tool: "deephaven.getPipServersStatus"
returns: {
  servers: Array<{
    url: string;
    port: number;
    isRunning: boolean;
  }>
}
```

#### 3. MCP Resources

Resources provide read-only access to extension state.

```typescript
// Server configuration
resource: "deephaven://config/servers"
returns: JSON configuration of all servers

// Current connections
resource: "deephaven://state/connections"
returns: Current connection states

// Active panels
resource: "deephaven://state/panels"
returns: Currently open panels/tables

// Extension settings
resource: "deephaven://config/settings"
returns: Current extension settings
```

#### 4. MCP Prompts

Pre-defined prompts to help AI assistants understand common tasks.

```typescript
prompt: "deephaven/quickstart"
description: "Help user get started with Deephaven in VS Code"

prompt: "deephaven/connect-and-query"
description: "Connect to a server and run a query"

prompt: "deephaven/debug-connection"
description: "Debug connection issues"

prompt: "deephaven/create-table"
description: "Help create a Deephaven table"
```

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1-2)

**Deliverables**:
1. `MCPServerController` class
2. MCP server initialization in `ExtensionController`
3. Basic request/response handling
4. Error handling and logging
5. Configuration file support (`.vscode/mcp.json`)

**Tasks**:
- [ ] Create `src/mcp/` directory structure
- [ ] Implement `MCPServerController`
- [ ] Add MCP server lifecycle to `ExtensionController.activate()`
- [ ] Set up stdio transport for MCP protocol
- [ ] Add configuration schema for MCP settings
- [ ] Write unit tests for core infrastructure

### Phase 2: Server Management Tools (Week 2-3)

**Deliverables**:
1. List servers tool
2. Connect/disconnect tools
3. Server status tools

**Tasks**:
- [ ] Implement `listServers` tool handler
- [ ] Implement `connectToServer` tool handler
- [ ] Implement `disconnectFromServer` tool handler
- [ ] Implement `getServerStatus` tool handler
- [ ] Add integration tests
- [ ] Document tools in README

### Phase 3: Query Execution Tools (Week 3-4)

**Deliverables**:
1. Execute script tool
2. Execute current file tool
3. Execute selection tool

**Tasks**:
- [ ] Implement `executeScript` tool handler
- [ ] Implement `executeCurrentFile` tool handler
- [ ] Implement `executeSelection` tool handler
- [ ] Add script execution result handling
- [ ] Add integration tests
- [ ] Document tools in README

### Phase 4: Panel/Table Discovery (Week 4-5)

**Deliverables**:
1. List panels tool
2. Get table schema tool
3. Sample table data tool

**Tasks**:
- [ ] Implement `listPanels` tool handler
- [ ] Implement `getTableSchema` tool handler
- [ ] Implement `sampleTableData` tool handler
- [ ] Add data serialization utilities
- [ ] Add integration tests
- [ ] Document tools in README

### Phase 5: Workspace Context (Week 5-6)

**Deliverables**:
1. Editor context tools
2. Workspace file discovery tools
3. MCP resources

**Tasks**:
- [ ] Implement `getEditorContext` tool handler
- [ ] Implement `listWorkspaceFiles` tool handler
- [ ] Implement MCP resources
- [ ] Add integration tests
- [ ] Document resources in README

### Phase 6: Managed Servers (Week 6-7)

**Deliverables**:
1. Start/stop pip server tools
2. Pip server status tools

**Tasks**:
- [ ] Implement `startPipServer` tool handler
- [ ] Implement `stopPipServer` tool handler
- [ ] Implement `getPipServersStatus` tool handler
- [ ] Add integration tests
- [ ] Document tools in README

### Phase 7: Documentation & Polish (Week 7-8)

**Deliverables**:
1. Complete MCP documentation
2. Example configurations
3. Tutorial videos/GIFs
4. AI assistant integration guide

**Tasks**:
- [ ] Write comprehensive MCP documentation
- [ ] Create example `.vscode/mcp.json` configurations
- [ ] Add MCP section to main README
- [ ] Create tutorial content
- [ ] Update CHANGELOG

## Technical Considerations

### MCP Server Implementation Language

**Recommendation: TypeScript/Node.js (Strongly Recommended)**

#### Why TypeScript/Node.js is the Best Choice:

**1. Zero Additional Runtime Dependencies**
- VS Code extensions already bundle Node.js runtime
- No need to ask users to install Python, manage virtual environments, or deal with version conflicts
- Works out-of-the-box on all platforms (Windows, macOS, Linux)

**2. Native Integration with Extension**
- Extension is already written in TypeScript
- MCP server can be part of the same codebase
- Direct access to all extension services (ServerManager, PanelService, etc.)
- No IPC (Inter-Process Communication) overhead
- Shared type definitions and utilities

**3. Simpler Build & Distribution**
- Bundle MCP server code with extension using existing esbuild setup
- Single `.vsix` file contains everything
- No separate installation steps
- No platform-specific binary compilation needed

**4. Better Developer Experience**
- Single language/toolchain for entire project
- Easier debugging (all code runs in same process)
- Consistent error handling and logging
- Easier for contributors (no Python/Node.js context switching)

**5. Proven MCP SDK Support**
- Official `@modelcontextprotocol/sdk` is TypeScript-first
- Excellent type safety and IntelliSense support
- Well-documented, actively maintained

#### Implementation Approaches:

**Option A: In-Process MCP Server (Recommended for MVP)**
```typescript
// MCP server runs within the extension process
// Pros: Simplest, direct access to extension state, no IPC
// Cons: Shares extension process (minimal concern for MCP usage patterns)

class MCPServerController {
  // Listens on stdio, handles requests in same process
  // Can directly call serverManager.executeFile(), etc.
}
```

**Option B: Separate Process with Node.js**
```typescript
// MCP server as separate Node.js process spawned by extension
// Pros: Process isolation, can restart independently
// Cons: Requires IPC, more complex, still need to bundle Node script

// Extension spawns: node ./out/mcp-server.js
```

**Why Not Python:**

❌ **Additional Installation Burden**
- Users must have Python installed (not guaranteed on Windows)
- Need to manage Python virtual environments
- Version compatibility issues (Python 3.8 vs 3.12, etc.)
- Additional dependencies to install (`pip install deephaven-mcp`)

❌ **Distribution Complexity**
- Can't bundle Python runtime in `.vsix` file
- Would need post-install scripts to setup Python environment
- Platform-specific issues (Windows PATH, macOS permissions, Linux distros)

❌ **Communication Overhead**
- Extension (Node.js) ↔ MCP Server (Python) requires IPC
- Need to implement robust IPC protocol (stdio, sockets, or pipes)
- Serialization overhead for all data
- Harder to debug cross-process issues

❌ **Fragmentation**
- Split codebase (TypeScript extension + Python MCP server)
- Duplicate logic (e.g., connection handling in both)
- Harder to keep in sync
- Different testing frameworks (vitest vs pytest)

#### Recommended Architecture:

```
┌────────────────────────────────────────────────────────┐
│              VS Code Extension Process                  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐ │
│  │      Extension Host (TypeScript/Node.js)         │ │
│  │                                                   │ │
│  │  ┌─────────────────────────────────────────────┐ │ │
│  │  │   ExtensionController                       │ │ │
│  │  │   ├─ ServerManager                          │ │ │
│  │  │   ├─ PanelService                           │ │ │
│  │  │   └─ ConfigService                          │ │ │
│  │  └─────────────────────────────────────────────┘ │ │
│  │              ▲                                    │ │
│  │              │ Direct method calls                │ │
│  │              ▼                                    │ │
│  │  ┌─────────────────────────────────────────────┐ │ │
│  │  │   MCPServerController                       │ │ │
│  │  │   └─ Tool Handlers (TypeScript)             │ │ │
│  │  └─────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────┘ │
│                       │                                │
│                       │ stdio (MCP Protocol)           │
│                       ▼                                │
└────────────────────────────────────────────────────────┘
                        │
                        │ stdio forwarding (VS Code handles)
                        ▼
              ┌──────────────────┐
              │   AI Assistant    │
              │  (Copilot/Claude) │
              └──────────────────┘
```

#### Implementation Steps:

1. **Add MCP SDK dependency**:
   ```json
   {
     "dependencies": {
       "@modelcontextprotocol/sdk": "^0.5.0"
     }
   }
   ```

2. **Create MCP server structure**:
   ```
   src/
     mcp/
       MCPServerController.ts    # Main controller
       tools/                    # Tool handlers
         executeFile.ts
         listServers.ts
         listPanels.ts
         openPanel.ts
       types.ts                  # MCP-specific types
       utils.ts                  # Utilities
   ```

3. **Initialize in extension activation**:
   ```typescript
   // In src/extension.ts
   export function activate(context: vscode.ExtensionContext) {
     controller = new ExtensionController(context, ConfigService);
     controller.activate();
     
     // Initialize MCP if requested
     if (process.argv.includes('--mcp-server')) {
       controller.initializeMCPServer();
     }
   }
   ```

4. **Configure in workspace**:
   ```json
   // .vscode/mcp.json
   {
     "servers": {
       "vscode-deephaven": {
         "command": "code",
         "args": [
           "--extensionDevelopmentPath=${workspaceFolder}",
           "--mcp-server"
         ]
       }
     }
   }
   ```

   Or for production installs:
   ```json
   {
     "servers": {
       "vscode-deephaven": {
         "command": "node",
         "args": [
           "${extensionPath}/out/mcp-standalone.js"
         ]
       }
     }
   }
   ```

#### Build Configuration:

Update `scripts/esbuild.js` to bundle MCP server:

```javascript
// Build both extension and optional standalone MCP server
const builds = [
  // Existing extension build
  {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'out/extension.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
  },
  // Optional: Standalone MCP server (if not using --mcp-server flag)
  {
    entryPoints: ['src/mcp/standalone.ts'],
    bundle: true,
    outfile: 'out/mcp-standalone.js',
    format: 'cjs',
    platform: 'node',
  },
];
```

### MCP Protocol Implementation

**Option 1: Use @modelcontextprotocol/sdk**
- **Pros**: Official SDK, maintained by Anthropic, TypeScript support
- **Cons**: Additional dependency

**Option 2: Custom Implementation**
- **Pros**: No dependencies, full control
- **Cons**: More work, potential for bugs

**Recommendation**: Use the official SDK for faster development and better compatibility.

### Communication Transport

**Option 1: stdio (Standard Input/Output)**
- **Pros**: Simple, widely supported, works with VS Code MCP configuration
- **Cons**: Limited to local process communication

**Option 2: HTTP/WebSocket**
- **Pros**: Network capable, more flexible
- **Cons**: More complex, requires port management

**Recommendation**: Start with stdio, add HTTP/WebSocket later if needed.

### Configuration

The MCP server should be configured via `.vscode/mcp.json` in the workspace:

```json
{
  "servers": {
    "vscode-deephaven": {
      "command": "code",
      "args": ["--extensionDevelopmentPath=/path/to/extension", "--mcp-server"],
      "env": {
        "DH_MCP_LOG_LEVEL": "info"
      }
    }
  }
}
```

Or via a CLI command that the extension provides:

```json
{
  "servers": {
    "vscode-deephaven": {
      "command": "/path/to/node",
      "args": ["/path/to/extension/out/mcp-server.js"]
    }
  }
}
```

### Security Considerations

1. **Credential Access**: MCP tools should not expose credentials directly
2. **Server URLs**: Only expose configured servers, not arbitrary URLs
3. **Script Execution**: Log all executed scripts for audit purposes
4. **Rate Limiting**: Prevent abuse of execute tools
5. **Input Validation**: Validate all tool parameters

### Error Handling

All MCP tool handlers should:
1. Validate input parameters
2. Catch and log errors
3. Return user-friendly error messages
4. Never expose internal implementation details

```typescript
async function executeScript(params: ExecuteScriptParams): Promise<MCPToolResult> {
  try {
    // Validate params
    if (!params.serverUrl || !params.script) {
      return {
        success: false,
        error: "Missing required parameters: serverUrl and script"
      };
    }
    
    // Execute
    const result = await serverManager.executeScript(
      new URL(params.serverUrl),
      params.script,
      params.consoleType
    );
    
    return { success: true, result };
  } catch (error) {
    logger.error('Failed to execute script', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
```

### Testing Strategy

1. **Unit Tests**: Test individual tool handlers in isolation
2. **Integration Tests**: Test MCP server with mock AI assistant
3. **E2E Tests**: Test with real AI assistants (GitHub Copilot, Claude)
4. **Manual Testing**: Verify user experience with AI assistants

## Dependencies

### New Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0"
  }
}
```

### Existing Dependencies (Leverage)

- `vscode`: Core VS Code API
- `@deephaven/jsapi-types`: Deephaven type definitions
- `@deephaven-enterprise/auth-nodejs`: Enterprise authentication

## Documentation

### User Documentation

1. **MCP Overview**: Explain what MCP is and why it's useful
2. **Setup Guide**: How to configure the MCP server
3. **AI Assistant Integration**: How to use with GitHub Copilot, Claude, etc.
4. **Tool Reference**: Complete list of available tools
5. **Examples**: Common use cases and workflows

### Developer Documentation

1. **Architecture**: High-level design and component relationships
2. **Adding Tools**: Guide for contributing new tools
3. **Testing**: How to test MCP functionality
4. **Debugging**: Troubleshooting MCP issues

## Success Metrics

1. **Adoption**: Number of users configuring MCP
2. **Usage**: Tool invocation frequency
3. **Reliability**: Error rate and success rate of tool calls
4. **Performance**: Average response time for tool calls
5. **User Satisfaction**: Feedback from AI assistant users

## Future Enhancements

### Phase 8+: Advanced Features

1. **Streaming Results**: Stream large table data
2. **Subscriptions**: Real-time updates for ticking tables
3. **Advanced Queries**: Support complex Deephaven query builders
4. **Plot Generation**: Create and retrieve plots
5. **Notebook Integration**: Support for Jupyter notebooks
6. **Multi-Workspace**: Handle multiple workspace folders
7. **Remote MCP Server**: Deploy as standalone server
8. **Enterprise Features**: Advanced DHE capabilities

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| MCP protocol changes | High | Medium | Use official SDK, monitor spec updates |
| Performance overhead | Medium | Low | Optimize tool handlers, add caching |
| Security vulnerabilities | High | Low | Thorough input validation, security audit |
| AI assistant compatibility | High | Medium | Test with multiple AI assistants |
| User adoption | Medium | Medium | Good documentation, examples |

## Appendix

### A. Related Projects

1. **deephaven-mcp**: Standalone MCP server for Deephaven
   - Location: `/Users/bingles/code/tools/deephaven-mcp`
   - Provides: Session management, documentation server
   - Learnings: Configuration patterns, tool design

2. **@modelcontextprotocol/sdk**: Official MCP SDK
   - Repository: https://github.com/modelcontextprotocol/typescript-sdk
   - Provides: Protocol implementation, types, utilities

### B. References

1. [Model Context Protocol Specification](https://modelcontextprotocol.io)
2. [VS Code Extension API](https://code.visualstudio.com/api)
3. [Deephaven Documentation](https://deephaven.io/core/docs/)
4. [GitHub Copilot Extensions](https://docs.github.com/en/copilot)

### C. Glossary

- **MCP**: Model Context Protocol
- **DHC**: Deephaven Community (Core)
- **DHE**: Deephaven Enterprise (Core+)
- **PSK**: Pre-Shared Key authentication
- **stdio**: Standard Input/Output
- **Tool**: An MCP function that can be invoked
- **Resource**: An MCP data source that can be read
- **Prompt**: An MCP template for common tasks

---

**Document Owner**: Development Team  
**Last Updated**: November 12, 2025  
**Next Review**: Start of each phase
