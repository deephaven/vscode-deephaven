import * as http from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpTool, McpToolSpec } from '../types';

vi.mock('vscode');

// Mock all tool creators to return minimal stub tools
vi.mock('./tools', () => ({
  createAddRemoteFileSourcesTool: vi.fn(() => makeStubTool('addRemoteFileSources')),
  createConnectToServerTool: vi.fn(() => makeStubTool('connectToServer')),
  createGetColumnStatsTool: vi.fn(() => makeStubTool('getColumnStats')),
  createGetLogsTool: vi.fn(() => makeStubTool('getLogs')),
  createGetTableDataTool: vi.fn(() => makeStubTool('getTableData')),
  createGetTableStatsTool: vi.fn(() => makeStubTool('getTableStats')),
  createListConnectionsTool: vi.fn(() => makeStubTool('listConnections')),
  createListVariablesTool: vi.fn(() => makeStubTool('listVariables')),
  createListRemoteFileSourcesTool: vi.fn(() => makeStubTool('listRemoteFileSources')),
  createListServersTool: vi.fn(() => makeStubTool('listServers')),
  createOpenFilesInEditorTool: vi.fn(() => makeStubTool('openFilesInEditor')),
  createOpenVariablePanelsTool: vi.fn(() => makeStubTool('openVariablePanels')),
  createRemoveRemoteFileSourcesTool: vi.fn(() => makeStubTool('removeRemoteFileSources')),
  createRunCodeFromUriTool: vi.fn(() => makeStubTool('runCodeFromUri')),
  createRunCodeTool: vi.fn(() => makeStubTool('runCode')),
  createSetEditorConnectionTool: vi.fn(() => makeStubTool('setEditorConnection')),
  createShowOutputPanelTool: vi.fn(() => makeStubTool('showOutputPanel')),
}));

vi.mock('./tools/connectToServer', () => ({
  createConnectToServerTool: vi.fn(() => makeStubTool('connectToServer')),
}));

/** Create a minimal stub tool that echoes back its args */
function makeStubTool(name: string): McpTool<McpToolSpec> {
  return {
    name,
    spec: {
      title: name,
      description: `Stub tool: ${name}`,
      inputSchema: {},
    },
    handler: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: `stub result for ${name}` }],
    }),
  };
}

/** Create a minimal mock for OutputChannelWithHistory */
function makeMockOutputChannel() {
  return {
    appendLine: vi.fn(),
    append: vi.fn(),
    show: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
    hide: vi.fn(),
    replace: vi.fn(),
    name: 'mock',
  };
}

// Helper: send an HTTP POST to the MCP server and collect the full response
function postToMcp(
  port: number,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<{ status: number; headers: http.IncomingMessage['headers']; body: string }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/mcp',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // StreamableHTTPServerTransport checks for acceptable response formats.
          // Include both JSON and SSE to satisfy the transport's Accept check.
          Accept: 'application/json, text/event-stream',
          'Content-Length': Buffer.byteLength(payload),
          ...headers,
        },
      },
      res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: data })
        );
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

const INITIALIZE_REQUEST = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '0.0.1' },
  },
};

const LIST_TOOLS_REQUEST = {
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/list',
  params: {},
};

describe('McpServer', () => {
  // Dynamic import so mocks above apply
  let McpServer: (typeof import('./McpServer'))['McpServer'];
  let server: import('./McpServer').McpServer;
  let port: number;

  beforeEach(async () => {
    ({ McpServer } = await import('./McpServer'));

    server = new McpServer(
      {} as any, // coreJsApiCache
      makeMockOutputChannel() as any, // outputChannel
      makeMockOutputChannel() as any, // outputChannelDebug
      {} as any, // panelService
      {} as any, // pythonDiagnostics
      {} as any, // pythonWorkspace
      {} as any  // serverManager
    );

    port = await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 1. Initialize request creates a new session
  // ─────────────────────────────────────────────────────────────────────────
  describe('session initialization', () => {
    it('should accept an initialize request and return a session ID', async () => {
      const res = await postToMcp(port, INITIALIZE_REQUEST);

      expect(res.status).toBe(200);
      // The session ID is returned either in the response header or body
      const sessionId =
        res.headers['mcp-session-id'] as string | undefined ??
        (() => {
          try {
            return JSON.parse(res.body)?.sessionId as string | undefined;
          } catch {
            return undefined;
          }
        })();

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
      expect(sessionId!.length).toBeGreaterThan(0);
    });

    it('should reject a non-initialize request with no session ID', async () => {
      const res = await postToMcp(port, LIST_TOOLS_REQUEST);

      expect(res.status).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe(-32600);
    });

    it('should reject GET requests with 405', async () => {
      const res = await new Promise<{ status: number }>((resolve, reject) => {
        const req = http.request(
          { hostname: '127.0.0.1', port, path: '/mcp', method: 'GET' },
          res => resolve({ status: res.statusCode ?? 0 })
        );
        req.on('error', reject);
        req.end();
      });

      expect(res.status).toBe(405);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Session persistence — same session ID reuses the session
  // ─────────────────────────────────────────────────────────────────────────
  describe('session persistence', () => {
    it('should reuse an existing session for subsequent requests', async () => {
      // Step 1: initialize
      const initRes = await postToMcp(port, INITIALIZE_REQUEST);
      expect(initRes.status).toBe(200);
      const sessionId = initRes.headers['mcp-session-id'] as string;
      expect(sessionId).toBeDefined();

      // Step 2: send tools/list with the same session ID
      const toolsRes = await postToMcp(port, LIST_TOOLS_REQUEST, {
        'mcp-session-id': sessionId,
      });

      expect(toolsRes.status).toBe(200);
      const toolsBody = JSON.parse(toolsRes.body);
      // Should have a result (not an error)
      expect(toolsBody.error).toBeUndefined();
      expect(toolsBody.result).toBeDefined();
    });

    it('should return all registered tools via tools/list', async () => {
      const initRes = await postToMcp(port, INITIALIZE_REQUEST);
      const sessionId = initRes.headers['mcp-session-id'] as string;

      const toolsRes = await postToMcp(port, LIST_TOOLS_REQUEST, {
        'mcp-session-id': sessionId,
      });

      const toolsBody = JSON.parse(toolsRes.body);
      expect(toolsBody.result?.tools).toBeInstanceOf(Array);
      // All 17 stub tools should be present
      expect(toolsBody.result.tools.length).toBe(17);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Session isolation — different session IDs get isolated server instances
  // ─────────────────────────────────────────────────────────────────────────
  describe('session isolation', () => {
    it('should create independent sessions for separate initialize requests', async () => {
      const [res1, res2] = await Promise.all([
        postToMcp(port, INITIALIZE_REQUEST),
        postToMcp(port, INITIALIZE_REQUEST),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      const session1 = res1.headers['mcp-session-id'] as string;
      const session2 = res2.headers['mcp-session-id'] as string;

      expect(session1).toBeDefined();
      expect(session2).toBeDefined();
      // Sessions should be distinct
      expect(session1).not.toBe(session2);
    });

    it('should reject requests using an unknown session ID', async () => {
      const res = await postToMcp(port, LIST_TOOLS_REQUEST, {
        'mcp-session-id': 'non-existent-session-id',
      });

      // Either 400 (bad session) or the server sends back an error JSON
      expect([400, 200]).toContain(res.status);
      if (res.status === 200) {
        const body = JSON.parse(res.body);
        // If 200, should contain an error in the JSON-RPC response
        expect(body.error).toBeDefined();
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Parallel requests — no race conditions
  // ─────────────────────────────────────────────────────────────────────────
  describe('parallel requests', () => {
    it('should handle parallel tool calls on the same session without errors', async () => {
      const initRes = await postToMcp(port, INITIALIZE_REQUEST);
      const sessionId = initRes.headers['mcp-session-id'] as string;

      // Fire 5 concurrent tools/list requests on the same session
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          postToMcp(
            port,
            { ...LIST_TOOLS_REQUEST, id: i + 10 },
            { 'mcp-session-id': sessionId }
          )
        )
      );

      // All should succeed without server errors
      for (const res of results) {
        expect(res.status).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.error).toBeUndefined();
        expect(body.result).toBeDefined();
      }
    });

    it('should handle parallel requests across different sessions without errors', async () => {
      // Initialize two sessions simultaneously
      const [init1, init2] = await Promise.all([
        postToMcp(port, INITIALIZE_REQUEST),
        postToMcp(port, INITIALIZE_REQUEST),
      ]);

      const session1 = init1.headers['mcp-session-id'] as string;
      const session2 = init2.headers['mcp-session-id'] as string;

      // Then fire requests on both sessions in parallel
      const [res1a, res1b, res2a, res2b] = await Promise.all([
        postToMcp(port, { ...LIST_TOOLS_REQUEST, id: 21 }, { 'mcp-session-id': session1 }),
        postToMcp(port, { ...LIST_TOOLS_REQUEST, id: 22 }, { 'mcp-session-id': session1 }),
        postToMcp(port, { ...LIST_TOOLS_REQUEST, id: 23 }, { 'mcp-session-id': session2 }),
        postToMcp(port, { ...LIST_TOOLS_REQUEST, id: 24 }, { 'mcp-session-id': session2 }),
      ]);

      for (const res of [res1a, res1b, res2a, res2b]) {
        expect(res.status).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.error).toBeUndefined();
        expect(body.result).toBeDefined();
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Tools functionality
  // ─────────────────────────────────────────────────────────────────────────
  describe('MCP tools availability', () => {
    it('should have addRemoteFileSources tool registered', async () => {
      const initRes = await postToMcp(port, INITIALIZE_REQUEST);
      const sessionId = initRes.headers['mcp-session-id'] as string;

      const toolsRes = await postToMcp(port, LIST_TOOLS_REQUEST, {
        'mcp-session-id': sessionId,
      });
      const tools: { name: string }[] = JSON.parse(toolsRes.body).result?.tools ?? [];
      expect(tools.some(t => t.name === 'addRemoteFileSources')).toBe(true);
    });

    it('should have listServers tool registered', async () => {
      const initRes = await postToMcp(port, INITIALIZE_REQUEST);
      const sessionId = initRes.headers['mcp-session-id'] as string;

      const toolsRes = await postToMcp(port, LIST_TOOLS_REQUEST, {
        'mcp-session-id': sessionId,
      });
      const tools: { name: string }[] = JSON.parse(toolsRes.body).result?.tools ?? [];
      expect(tools.some(t => t.name === 'listServers')).toBe(true);
    });

    it('should have runCode tool registered', async () => {
      const initRes = await postToMcp(port, INITIALIZE_REQUEST);
      const sessionId = initRes.headers['mcp-session-id'] as string;

      const toolsRes = await postToMcp(port, LIST_TOOLS_REQUEST, {
        'mcp-session-id': sessionId,
      });
      const tools: { name: string }[] = JSON.parse(toolsRes.body).result?.tools ?? [];
      expect(tools.some(t => t.name === 'runCode')).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 6. Session cleanup
  // ─────────────────────────────────────────────────────────────────────────
  describe('session cleanup on stop()', () => {
    it('should clear all sessions when stop() is called', async () => {
      // Create two sessions
      await Promise.all([
        postToMcp(port, INITIALIZE_REQUEST),
        postToMcp(port, INITIALIZE_REQUEST),
      ]);

      // Access internal Maps for verification
      const mcpServer = server as unknown as {
        transports: Map<string, unknown>;
        servers: Map<string, unknown>;
      };

      expect(mcpServer.transports.size).toBe(2);
      expect(mcpServer.servers.size).toBe(2);

      await server.stop();

      expect(mcpServer.transports.size).toBe(0);
      expect(mcpServer.servers.size).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 7. Port allocation
  // ─────────────────────────────────────────────────────────────────────────
  describe('port management', () => {
    it('should return the allocated port via getPort()', () => {
      expect(server.getPort()).toBe(port);
      expect(typeof port).toBe('number');
      expect(port).toBeGreaterThan(0);
    });

    it('should return null from getPort() after stop()', async () => {
      await server.stop();
      expect(server.getPort()).toBeNull();
    });
  });
});
