# MCP Session-Based Migration Plan

> 📖 **See Also**: [MCP Session Architecture](./mcp-session-architecture.md) for detailed layer diagrams and request flow examples.

## Overview

Migrate the Deephaven VS Code extension's MCP server from **stateless** (new transport per request) to **stateful** (session-based with transport reuse) to enable:

- **Fix parallel request failures** ⚠️ **CRITICAL BUG FIX**
- **Server-to-client notifications** (logging, progress updates)
- **MCP Apps support** (interactive UIs requiring persistent sessions)
- **Task-based execution patterns** (long-running operations)
- **Resumability** (client reconnection after disconnects)

## Current State Analysis

### Current Implementation (Stateless)

**File**: [src/mcp/McpServer.ts](../src/mcp/McpServer.ts#L126-L138)

```typescript
// Create a new transport for each request
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined, // ❌ No sessions
  enableJsonResponse: true,
});

res.on('close', () => {
  transport.close();
});

await this.server.connect(transport); // ⚠️ RACE CONDITION with parallel requests!
await transport.handleRequest(req, res, requestBody);
```

**Key Characteristics:**

- ✅ Server instance created once in constructor (already shared)
- ❌ New transport created per request
- ❌ No session persistence between requests
- ❌ Cannot send notifications to clients
- ❌ Cannot support MCP Apps
- **⚠️ CRITICAL: Same server instance connected to multiple transports concurrently → race conditions**

### The Parallel Request Bug

**Problem**: When concurrent requests arrive, the current implementation calls `server.connect(transport)` multiple times on the **same** `this.server` instance with **different** transports:

```
Request A → transportA → server.connect(transportA) ─┐
                                                      ├─→ SAME server instance
Request B → transportB → server.connect(transportB) ─┘
            (parallel)
```

**Result**: Race condition where:

- Requests may fail with connection errors
- Responses get routed to wrong clients
- Server state becomes corrupted
- Unpredictable behavior under load

**Root Cause**: MCP SDK's server instance is **not designed** to be connected to multiple transports simultaneously. Each `connect()` call overwrites the previous connection.

**How Sessions Fix This**: In stateful mode:

1. Each session gets its own `server` + `transport` pair
2. `server.connect(transport)` called **once** during session initialization
3. All requests within a session reuse the same connected transport
4. Parallel requests to **same session** → queued by transport (safe ✅)
5. Parallel requests to **different sessions** → isolated server instances (safe ✅)

### Tools Analysis

**Current tools** (17 registered):

- None currently use notifications or session-specific features
- All work independently with current stateless pattern
- No breaking changes needed for existing functionality

**Future capabilities unlocked by sessions**:

- Progress notifications for long-running operations (table data fetching, code execution)
- Logging messages to client console
- MCP Apps for interactive data exploration
- Task-based execution for async operations

## Migration Strategy

### Phase 1: Core Session Implementation

Convert the HTTP request handler from stateless to stateful pattern.

#### Changes Required

**1. Refactor Server Creation**

Move server creation from constructor to a factory function:

```typescript
private createServer(): SdkMcpServer {
  const server = new SdkMcpServer({
    name: MCP_SERVER_NAME,
    version: '1.0.0',
  });

  // Register all tools
  this.registerToolsOnServer(server);

  return server;
}
```

**2. Add Session Storage**

Add to `McpServer` class:

```typescript
private transports: Map<string, StreamableHTTPServerTransport> = new Map();
private servers: Map<string, SdkMcpServer> = new Map();
```

**3. Import Required Types**

```typescript
import { randomUUID } from 'node:crypto';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
```

**4. Refactor Request Handler**

Transform the HTTP request handler to:

- Extract `mcp-session-id` header
- Reuse existing sessions
- Initialize new sessions with **new server instance** + transport + callbacks
- Handle cleanup on session close

**5. Add Graceful Shutdown**

Ensure all sessions are cleaned up when server stops:

```typescript
async stop(): Promise<void> {
  // Close all active sessions (both transport and server)
  for (const [sessionId, transport] of this.transports.entries()) {
    try {
      await transport.close();
      const server = this.servers.get(sessionId);
      await server?.close();
    } catch (error) {
      // Log but continue cleanup
    }
  }
  this.transports.clear();
  this.servers.clear();

  // Existing HTTP server cleanup
  // ...
}
```

### Phase 2: Optional Enhancements

These can be added after core migration is stable.

#### 2.1 Event Store for Resumability

```typescript
import { InMemoryEventStore } from '@modelcontextprotocol/sdk/experimental/eventStore/inMemory.js';

// Add to McpServer
private eventStores: Map<string, InMemoryEventStore> = new Map();

// In session initialization
const eventStore = new InMemoryEventStore();
this.eventStores.set(sessionId, eventStore);

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
  eventStore,  // Enables resumability
  // ...
});
```

#### 2.2 Session Monitoring/Logging

Add session lifecycle logging:

- Session creation
- Session reuse
- Session cleanup
- Active session count

#### 2.3 Session Timeout/Cleanup

Implement timeout for inactive sessions:

- Track last activity per session
- Periodic cleanup of stale sessions
- Configurable timeout duration

## Implementation Steps

### Step 1: Update McpServer Class Structure

**File**: `src/mcp/McpServer.ts`

- [ ] Add imports: `randomUUID`, `isInitializeRequest`
- [ ] Add `transports` Map as private property
- [ ] Add `servers` Map as private property
- [ ] Refactor constructor to create `registerToolsOnServer` method
- [ ] Create `createServer()` factory method
- [ ] Remove `this.server` property (will be per-session now)
- [ ] Update class documentation to reflect stateful behavior

### Step 2: Refactor `start()` Method

**File**: `src/mcp/McpServer.ts`

Replace the request handler inside `http.createServer()`:

- [ ] Extract `mcp-session-id` header
- [ ] Add session reuse logic for existing sessions
- [ ] Add initialization detection with `isInitializeRequest()`
- [ ] Create new server instance per session during initialization
- [ ] Configure `sessionIdGenerator: () => randomUUID()`
- [ ] Implement `onsessioninitialized` callback to store transport + server
- [ ] Add `onclose` cleanup handler (remove from both Maps)
- [ ] Add validation for invalid request combinations
- [ ] Update JSDoc comment to reflect stateful implementation

### Step 3: Update `stop()` Method

**File**: `src/mcp/McpServer.ts`

- [ ] Add session cleanup loop before HTTP server close
- [ ] Close all transports
- [ ] Close all server instances
- [ ] Clear both Maps
- [ ] Add error handling for individual session cleanup

### Step 4: Testing

- [ ] Test new session initialization
- [ ] **Test parallel requests (concurrent tool calls)**
- [ ] **Test parallel requests across different sessions**
- [ ] Test session reuse across multiple requests
- [ ] Test session cleanup on client disconnect
- [ ] Test server shutdown with active sessions
- [ ] Test invalid request combinations (no sessionId + non-initialize request)
- [ ] Verify existing tools still work correctly
- [ ] Test MCP Apps capability (once implemented)

### Step 5: Documentation

- [ ] Update code comments in `McpServer.ts`
- [ ] Update `docs/mcp.md` to mention session support
- [ ] Add troubleshooting section for session issues
- [ ] Document session lifecycle for future developers

## Technical Details

### Session ID Flow

1. **First Request (Initialize)**:

   - Client sends initialize request WITHOUT `mcp-session-id` header
   - Server detects via `isInitializeRequest(req.body)`
   - Server creates **new server instance** for this session
   - Server creates new transport with `sessionIdGenerator`
   - Server connects: `await server.connect(transport)`
   - `onsessioninitialized` callback fires with new session ID
   - Server stores both transport AND server in Maps
   - Response includes session ID

2. **Subsequent Requests**:

   - Client sends `mcp-session-id` header
   - Server looks up transport in Map
   - Server reuses existing transport (server already connected)
   - Same server instance handles request
   - **No additional `connect()` calls** → no race conditions

3. **Session Cleanup**:
   - Client disconnects
   - `onclose` handler fires
   - Server removes transport from Map
   - Server closes and removes server instance from Map
   - Resources freed

### Parallel Request Handling

**Within Same Session**:

```
Request A (session-123) ─┐
                         ├─→ Same transport → Queued internally → Safe ✅
Request B (session-123) ─┘
```

**Across Different Sessions**:

```
Request A (session-123) → transportA + serverA → Isolated ✅
Request B (session-456) → transportB + serverB → Isolated ✅
```

### Critical Implementation Notes

From SKILL.md reference:

1. **Store transport + server in callback, not immediately**:

   ```typescript
   // ❌ WRONG - Race condition
   const server = createServer();
   const transport = new StreamableHTTPServerTransport({...});
   transports.set(???, transport); // Don't know session ID yet!
   servers.set(???, server);

   // ✅ CORRECT - Wait for callback
   const server = createServer();
   const transport = new StreamableHTTPServerTransport({
     sessionIdGenerator: () => randomUUID(),
     onsessioninitialized: sessionId => {
       transports.set(sessionId, transport);
       servers.set(sessionId, server);  // Now we know the ID
     }
   });
   ```

2. **Create server per session, not globally**:

   - Current code has ONE server instance ❌
   - New code creates server per session ✅
   - Ensures isolation and prevents race conditions

3. **Connect server only once per session**:

   - During initialization: `await server.connect(transport)` ✅
   - Subsequent requests: Reuse transport, no additional connects ✅
   - This is the key fix for parallel request failures!

4. **Handle edge cases**:
   - No session ID + not initialize request → 400 error
   - Invalid session ID → 404 error with helpful message
   - Concurrent requests for same session → should work (transport handles queue)

## Risk Assessment

### Benefits

- **Fixes critical bug**: Resolves parallel request race conditions
- **Enables new features**: Notifications, MCP Apps, task-based execution
- **Better architecture**: Proper session isolation

### Low Risk

- VS Code Copilot client supports sessions
- Clear rollback path to stateless pattern

### Medium Risk

- Session cleanup bugs could cause memory leaks
  - **Mitigation**: Comprehensive testing, add session monitoring
- Session ID mismatch causing connection failures
  - **Mitigation**: Better error messages, logging
- Windsurf MCP client compatibility
  - **Mitigation**: Test with both VS Code and Windsurf

### High Risk

- None identified

## Rollback Plan

If issues arise:

1. Revert `McpServer.ts` changes
2. Restore stateless pattern:
   - `sessionIdGenerator: undefined`
   - Remove transport storage
   - Remove session callbacks

All existing functionality will continue working as before.

## Success Criteria

- ✅ **Parallel requests work correctly** (primary bug fix)
- ✅ All existing tools work correctly
- ✅ New sessions successfully initialize
- ✅ Sessions persist across multiple requests
- ✅ Sessions clean up properly on disconnect
- ✅ Server shutdown cleans up all active sessions
- ✅ No memory leaks (verify with long-running tests)
- ✅ Server can send notifications (when tool implemented)
- ✅ MCP Apps can be registered and function

## Timeline Estimate

- **Step 1-2**: 2-3 hours (core implementation)
- **Step 3**: 30 minutes (cleanup logic)
- **Step 4**: 2-3 hours (comprehensive testing)
- **Step 5**: 1 hour (documentation)

**Total**: ~6-8 hours for complete migration

## Future Enhancements (Post-Migration)

Once sessions are working:

1. **Notification Tools**:

   - Add tools that send progress updates
   - Add tools that send log messages
   - Example: Long table queries with progress bars

2. **MCP Apps**:

   - Interactive data exploration UI
   - Table viewer with filtering/sorting
   - Connection manager UI

3. **Task-Based Execution**:

   - Async code execution with progress
   - Background query processing
   - Job queue management

4. **OAuth Integration** (if needed):
   - Session-based auth flows
   - Token management per session

## Reference Implementation

See skill reference files:

- `.claude/skills/mcp-session-implementing/reference/stateless-pattern.ts`
- `.claude/skills/mcp-session-implementing/reference/stateful-pattern.ts`

Official SDK examples:

- `@modelcontextprotocol/sdk/src/examples/server/simpleStreamableHttp.ts`

## Questions for Review

1. Do we want to implement event store (resumability) in initial migration or defer?
   - **Recommendation**: Defer to Phase 2
2. Should we add session timeout/cleanup initially?
   - **Recommendation**: Defer to Phase 2
3. Any specific MCP App use cases to prioritize?

   - **Recommendation**: Start with table viewer/explorer

4. Should we version the MCP server to indicate session support?
   - **Recommendation**: mcpVersion already increments on tool changes; sessions shouldn't need version bump

## Next Steps

1. Review this plan with team
2. Get approval for migration
3. Create feature branch for implementation
4. Implement Steps 1-3 (core changes)
5. Test thoroughly (Step 4) - **especially parallel request scenarios**
6. Update documentation (Step 5)
7. Code review
8. Merge to main branch

---

## Summary: How This Fixes Parallel Requests

### Current Bug (Stateless)

```typescript
// ONE global server instance
this.server = new SdkMcpServer({...});

// For EVERY request:
const transport = new StreamableHTTPServerTransport({...});
await this.server.connect(transport);  // ⚠️ Overwrites previous connection!
```

**Problem**: Parallel requests call `connect()` on the same server with different transports → race condition.

### Fixed (Stateful)

```typescript
// During session initialization ONLY:
const server = createServer();  // New server per session
const transport = new StreamableHTTPServerTransport({...});
await server.connect(transport);  // Connected ONCE
stores.set(sessionId, { server, transport });

// For subsequent requests in same session:
const { transport } = stores.get(sessionId);
await transport.handleRequest(...);  // No connect() call!
```

**Solution**:

- One server+transport pair per session
- Connected once during initialization
- Parallel requests within session → queued by transport
- Parallel requests across sessions → isolated server instances

**Result**: No more race conditions ✅
