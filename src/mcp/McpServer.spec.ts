import * as http from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from './McpServer';
import type {
  ConnectionState,
  IServerManager,
  UniqueID,
  WorkerInfo,
} from '../types';
import { MOCK_DHC_URL } from './utils/mcpTestUtils';

vi.mock('vscode');

const GET_WORKER_INFO_DELAY_MS = 300;

const MOCK_CONNECTION: ConnectionState = {
  serverUrl: MOCK_DHC_URL,
  label: 'Connection 1',
  isConnected: true,
  isRunningCode: false,
  tagId: 'conn1' as UniqueID,
};

const EXPECTED_TOOL_NAMES = [
  'addRemoteFileSources',
  'connectToServer',
  'getColumnStats',
  'getLogs',
  'getTableData',
  'getTableStats',
  'listConnections',
  'listRemoteFileSources',
  'listServers',
  'listVariables',
  'openFilesInEditor',
  'openVariablePanels',
  'removeRemoteFileSources',
  'runCode',
  'runCodeFromUri',
  'showOutputPanel',
];

/** Headers a 2025-era Streamable HTTP client sends on every POST. */
/* eslint-disable @typescript-eslint/naming-convention */
const LEGACY_POST_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
  'mcp-protocol-version': '2025-06-18',
} as const;
/* eslint-enable @typescript-eslint/naming-convention */

interface RawResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

/**
 * Send a raw HTTP request. Uses `http.request` rather than `fetch` so that
 * forbidden headers such as `Host` and `Origin` can be set.
 */
function request(
  port: number,
  {
    method = 'POST',
    path = '/mcp',
    headers = {},
    body,
  }: {
    method?: string;
    path?: string;
    headers?: Record<string, string>;
    body?: unknown;
  }
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, method, path, headers },
      res => {
        let data = '';
        res.on('data', chunk => {
          data += chunk;
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: data,
          })
        );
      }
    );
    req.on('error', reject);
    if (body != null) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

function jsonRpc(
  id: number,
  method: string,
  params: Record<string, unknown> = {}
): Record<string, unknown> {
  return { jsonrpc: '2.0', id, method, params };
}

describe('McpServer', () => {
  const serverManager = {
    getConnections: vi.fn(),
    getWorkerInfo: vi.fn(),
  } as unknown as IServerManager;

  let mcpServer: McpServer;
  let port: number;

  beforeEach(async () => {
    vi.clearAllMocks();

    vi.mocked(serverManager.getConnections).mockReturnValue([MOCK_CONNECTION]);
    vi.mocked(serverManager.getWorkerInfo).mockImplementation(
      () =>
        new Promise<WorkerInfo | undefined>(resolve =>
          setTimeout(() => resolve(undefined), GET_WORKER_INFO_DELAY_MS)
        )
    );

    mcpServer = new McpServer(
      ...([
        undefined, // coreJsApiCache
        undefined, // outputChannel
        undefined, // outputChannelDebug
        undefined, // panelService
        undefined, // groovyDiagnostics
        undefined, // groovyWorkspace
        undefined, // pythonDiagnostics
        undefined, // pythonWorkspace
        serverManager,
      ] as unknown as ConstructorParameters<typeof McpServer>)
    );

    port = await mcpServer.start(0);
  });

  afterEach(async () => {
    await mcpServer.stop();
  });

  it('should serve overlapping tool calls concurrently', async () => {
    const startMs = performance.now();

    const responses = await Promise.all(
      [1, 2, 3].map(id =>
        request(port, {
          headers: LEGACY_POST_HEADERS,
          body: jsonRpc(id, 'tools/call', {
            name: 'listConnections',
            arguments: {},
          }),
        })
      )
    );

    const elapsedMs = performance.now() - startMs;

    responses.forEach((response, i) => {
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');

      const { id, result } = JSON.parse(response.body);
      expect(id).toBe(i + 1);
      expect(result.structuredContent).toMatchObject({
        success: true,
        details: {
          connections: [expect.objectContaining({ label: 'Connection 1' })],
        },
      });
    });

    expect(elapsedMs).toBeLessThan(GET_WORKER_INFO_DELAY_MS * 3);
  });

  it('should respond to initialize with application/json', async () => {
    const response = await request(port, {
      headers: LEGACY_POST_HEADERS,
      body: jsonRpc(1, 'initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(JSON.parse(response.body).result.serverInfo).toBeDefined();
  });

  it('should list all tools with schema descriptions', async () => {
    const response = await request(port, {
      headers: LEGACY_POST_HEADERS,
      body: jsonRpc(1, 'tools/list'),
    });

    const { tools } = JSON.parse(response.body).result as {
      tools: {
        name: string;
        inputSchema: {
          properties: Record<string, { description?: string }>;
        };
      }[];
    };

    expect(tools.map(({ name }) => name).sort()).toEqual(EXPECTED_TOOL_NAMES);

    const listVariables = tools.find(({ name }) => name === 'listVariables');
    expect(
      listVariables?.inputSchema.properties.connectionUrl.description
    ).toBe(
      'The Deephaven Core / Core+ connection URL (e.g., "http://localhost:10000")'
    );
  });

  it.each<{ name: string; headers: Record<string, string>; status: number }>([
    { name: 'non-localhost Host', headers: { host: 'evil.com' }, status: 403 },
    {
      name: 'non-localhost Origin',
      headers: { origin: 'http://evil.com' },
      status: 403,
    },
    {
      name: 'localhost Origin',
      headers: { origin: 'http://localhost:1234' },
      status: 200,
    },
    { name: 'no Origin', headers: {}, status: 200 },
  ])('should respond $status for $name', async ({ headers, status }) => {
    const response = await request(port, {
      headers: { ...LEGACY_POST_HEADERS, ...headers },
      body: jsonRpc(1, 'tools/list'),
    });

    expect(response.status).toBe(status);
  });

  it.each(['GET', 'DELETE'])('should respond 405 to %s', async method => {
    const response = await request(port, {
      method,
      headers: { accept: 'text/event-stream' },
    });

    expect(response.status).toBe(405);
  });

  it('should respond 415 to non-JSON content type', async () => {
    const response = await request(port, {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      headers: { ...LEGACY_POST_HEADERS, 'content-type': 'text/plain' },
      body: jsonRpc(1, 'tools/list'),
    });

    expect(response.status).toBe(415);
  });

  it('should respond 404 to other paths', async () => {
    const response = await request(port, { method: 'GET', path: '/other' });

    expect(response.status).toBe(404);
    expect(response.body).toBe('Not found');
  });
});
