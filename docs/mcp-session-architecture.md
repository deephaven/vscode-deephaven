# MCP Session Architecture

## Understanding the Layers

There are distinct layers in the MCP server architecture:

### Layer 1: HTTP Server (Network Layer)

- **ONE** `http.Server` instance per VS Code extension
- Listens on a **single port** (e.g., `http://localhost:45678/mcp`)
- Receives all incoming HTTP requests
- Routes requests based on session ID
- Lives for the entire lifetime of the extension

### Layer 2: MCP SDK Server Instances (Protocol Layer)

- Handles MCP protocol logic (tool registration, request/response)
- **Current (Stateless)**: ONE shared instance
- **New (Stateful)**: MULTIPLE instances (one per session)

### Layer 3: Transport Layer

- Manages request/response streaming
- **Current (Stateless)**: New transport per HTTP request
- **New (Stateful)**: One transport per session, reused across requests

## Current Architecture (Stateless)

```
┌─────────────────────────────────────────────────────┐
│ VS Code Extension Process                           │
│                                                      │
│  ┌────────────────────────────────────────────┐    │
│  │ McpServer Class Instance                   │    │
│  │                                             │    │
│  │  http.Server (Port 45678)  ◄───────────────┼────┼─── Client Request 1
│  │         │                                   │    │
│  │         │                                   │    │
│  │         ├─► Create Transport 1              │    │
│  │         │   Connect SdkMcpServer ──────┐    │    │
│  │         │   Handle Request             │    │    │
│  │         │   Close Transport            │    │    │
│  │         │                              │    │    │
│  │         ├─► Create Transport 2  ◄───────────┼────┼─── Client Request 2
│  │         │   Connect SdkMcpServer ──┐   │    │    │    (parallel)
│  │         │   Handle Request         │   │    │    │
│  │         │   Close Transport        │   │    │    │
│  │         │                          │   │    │    │
│  │  SHARED SdkMcpServer Instance  ◄──┴───┴────┼─── ⚠️ RACE CONDITION!
│  │  (ONE instance, multiple connections)      │    │
│  │                                             │    │
│  └────────────────────────────────────────────┘    │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**Problem**: Multiple transports trying to connect to the **same** SDK server instance simultaneously.

## New Architecture (Stateful with Sessions)

```
┌─────────────────────────────────────────────────────────────────┐
│ VS Code Extension Process                                       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ McpServer Class Instance                                  │  │
│  │                                                            │  │
│  │  http.Server (Port 45678)  ◄─────────────────────────────┼──┼─── Initialize Request
│  │         │                                                 │  │    (no session ID)
│  │         │                                                 │  │
│  │         ├─► Detect Initialize Request                    │  │
│  │         │   Create NEW SdkMcpServer for Session A        │  │
│  │         │   Create Transport A                           │  │
│  │         │   Connect Server A to Transport A (ONCE)       │  │
│  │         │   Store in Maps                                │  │
│  │         │   Return session ID: "session-abc"             │  │
│  │         │                                                 │  │
│  │         ├─► Request with session-abc  ◄──────────────────┼──┼─── Follow-up Request 1
│  │         │   Lookup Transport A                           │  │
│  │         │   Reuse (no new connection)                    │  │
│  │         │                                                 │  │
│  │         ├─► Request with session-abc  ◄──────────────────┼──┼─── Follow-up Request 2
│  │         │   Lookup Transport A                           │  │    (parallel)
│  │         │   Reuse (no new connection)                    │  │
│  │         │                                                 │  │
│  │         ├─► Initialize Request (different client) ◄──────┼──┼─── New Session
│  │         │   Create NEW SdkMcpServer for Session B        │  │
│  │         │   Create Transport B                           │  │
│  │         │   Connect Server B to Transport B (ONCE)       │  │
│  │         │   Store in Maps                                │  │
│  │         │   Return session ID: "session-xyz"             │  │
│  │         │                                                 │  │
│  │  Session Storage:                                        │  │
│  │  ┌─────────────────────────────────────────────┐        │  │
│  │  │ transports Map                              │        │  │
│  │  │   "session-abc" → Transport A ──┐           │        │  │
│  │  │   "session-xyz" → Transport B ──┼─┐         │        │  │
│  │  └──────────────────────────────────┼─┼─────────┘        │  │
│  │                                     │ │                  │  │
│  │  ┌─────────────────────────────────┼─┼─────────┐        │  │
│  │  │ servers Map                     │ │         │        │  │
│  │  │   "session-abc" → SdkMcpServer A│ │         │        │  │
│  │  │   "session-xyz" → SdkMcpServer B  │         │        │  │
│  │  └────────────────────────────────────┼─────────┘        │  │
│  │                                       │                  │  │
│  │  SdkMcpServer Instance A  ◄───────────┘                 │  │
│  │  (tools registered, connected to Transport A)           │  │
│  │                                                          │  │
│  │  SdkMcpServer Instance B  ◄──────────────────────────┐  │  │
│  │  (tools registered, connected to Transport B)        │  │  │
│  │                                                       │  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Solution**: Each session has its own isolated SDK server + transport pair.

## Key Points

### 1. HTTP Server (Always ONE)

```typescript
class McpServer {
  private httpServer: http.Server | null = null; // ← ONE instance

  async start(port: number) {
    // Create ONE HTTP server that listens on ONE port
    this.httpServer = http.createServer(async (req, res) => {
      // Route to appropriate session based on session ID
    });

    this.httpServer.listen(port);
  }
}
```

- **Never changes**: Always one HTTP server per extension instance
- **Port**: Single port shared by all sessions
- **Routing**: Uses `mcp-session-id` header to route to correct session

### 2. SDK Server Instances (ONE → MANY)

**Current (Stateless)**:

```typescript
class McpServer {
  private server: SdkMcpServer;  // ← Shared by all requests

  constructor() {
    this.server = new SdkMcpServer({...});
    // Register tools once
  }
}
```

**New (Stateful)**:

```typescript
class McpServer {
  private servers: Map<string, SdkMcpServer>;  // ← One per session

  private createServer(): SdkMcpServer {
    const server = new SdkMcpServer({...});
    // Register tools on this instance
    return server;
  }

  async handleInitialize() {
    const server = this.createServer();  // New instance!
    const sessionId = randomUUID();
    this.servers.set(sessionId, server);
  }
}
```

### 3. Request Flow Examples

#### Example 1: Single Client, Multiple Requests

```
Client 1 (VS Code Copilot)
  │
  ├─► POST /mcp (initialize)       ──┐
  │   No session ID                  │
  │   ← Response: session-abc        │
  │                                  │  Same Session
  ├─► POST /mcp (list tools)       ──┤  Same Server Instance
  │   Session: session-abc           │  Same Transport
  │                                  │
  ├─► POST /mcp (call tool)        ──┤
  │   Session: session-abc           │
  │                                  │
  └─► POST /mcp (call tool)        ──┘
      Session: session-abc
```

**Result**:

- 4 HTTP requests → ONE HTTP server
- 1 session → ONE SDK server instance
- 1 session → ONE transport (reused 4 times)

#### Example 2: Multiple Clients (Parallel Sessions)

```
Client 1 (VS Code)           Client 2 (Windsurf)
  │                               │
  ├─► POST /mcp (init)           ├─► POST /mcp (init)
  │   ← session-abc               │   ← session-xyz
  │                               │
  │   Different Sessions          │
  │   Different SDK Servers       │
  │   Isolated from each other    │
  │                               │
  ├─► POST /mcp (tool)           ├─► POST /mcp (tool)
  │   session-abc                 │   session-xyz
  │                               │
  └─► POST /mcp (tool)           └─► POST /mcp (tool)
      session-abc                     session-xyz
```

**Result**:

- 6 HTTP requests → ONE HTTP server (handles all)
- 2 sessions → TWO SDK server instances
- 2 transports (one per session)

#### Example 3: Parallel Requests in Same Session

```
Client (parallel tool calls)
  │
  ├──┬─► POST /mcp (tool A)  ─┐
  │  │   session-abc          │
  │  │                        ├─► Same Transport
  │  └─► POST /mcp (tool B)  ─┘    Queued internally
  │      session-abc
  │      (parallel)
```

**Result**:

- Both requests arrive at HTTP server simultaneously
- Both lookup same transport from `transports.get("session-abc")`
- Transport handles queueing internally
- No race condition because server is already connected

## Why This Architecture?

### Network Constraints

- **ONE port per service**: Can't have multiple HTTP servers on same port
- **Solution**: One HTTP server routes to multiple sessions

### Protocol Isolation

- **Sessions must be isolated**: Different clients shouldn't interfere
- **Solution**: Separate SDK server instance per session

### Connection Stability

- **Avoid reconnection overhead**: `server.connect()` should happen once
- **Solution**: Create connection during initialization, reuse transport

## Memory Implications

### Current (Stateless)

```
Memory per request:
- Transport: ~1KB
- Connection overhead: ~100ms
- Total: Minimal but inefficient (created/destroyed constantly)
```

### New (Stateful)

```
Memory per session:
- SDK Server instance: ~50KB
- Transport: ~1KB
- Event store (optional): ~10KB
- Total: ~60KB per active session

Typical usage:
- 1-2 active sessions (one per IDE)
- ~120KB total
- Sessions cleaned up when idle
```

**Trade-off**: Slightly more memory for much better performance and new capabilities.

## Implementation Details

### HTTP Request Handler Pseudocode

```typescript
this.httpServer = http.createServer(async (req, res) => {
  // Extract session ID from header
  const sessionId = req.headers['mcp-session-id'];

  if (sessionId && this.transports.has(sessionId)) {
    // EXISTING SESSION: Reuse transport
    const transport = this.transports.get(sessionId);
    await transport.handleRequest(req, res, body);
  } else if (!sessionId && isInitializeRequest(body)) {
    // NEW SESSION: Create server + transport
    const server = this.createServer(); // New SdkMcpServer
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: sessionId => {
        this.servers.set(sessionId, server);
        this.transports.set(sessionId, transport);
      },
    });

    await server.connect(transport); // Connect ONCE
    await transport.handleRequest(req, res, body);
  } else {
    // ERROR: Invalid request
    res.status(400).json({ error: 'Invalid session' });
  }
});
```

## Summary

| Layer           | Current (Stateless) | New (Stateful)              |
| --------------- | ------------------- | --------------------------- |
| **HTTP Server** | 1 instance          | 1 instance (no change)      |
| **Port**        | 1 port              | 1 port (no change)          |
| **SDK Servers** | 1 shared instance   | N instances (1 per session) |
| **Transports**  | 1 per request       | 1 per session               |
| **Connections** | N per request       | 1 per session               |

The HTTP server is just a **router** - it receives requests and dispatches them to the appropriate session's SDK server instance based on the session ID.
