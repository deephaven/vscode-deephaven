import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import { McpServer as SdkMcpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import * as http from 'http';
import type {
  IAsyncCacheService,
  IPanelService,
  IServerManager,
  McpTool,
  McpToolSpec,
} from '../types';
import { MCP_SERVER_NAME } from '../common';
import {
  createAddRemoteFileSourcesTool,
  createGetColumnStatsTool,
  createGetLogsTool,
  createGetTableDataTool,
  createGetTableStatsTool,
  createListConnectionsTool,
  createListVariablesTool,
  createListRemoteFileSourcesTool,
  createListServersTool,
  createOpenFilesInEditorTool,
  createOpenVariablePanelsTool,
  createRemoveRemoteFileSourcesTool,
  createRunCodeFromUriTool,
  createRunCodeTool,
  createSetEditorConnectionTool,
  createShowOutputPanelTool,
} from './tools';
import { OutputChannelWithHistory, withResolvers } from '../util';
import { DisposableBase, type FilteredWorkspace } from '../services';
import { createConnectToServerTool } from './tools/connectToServer';

/**
 * MCP Server for Deephaven extension.
 * Provides tools for AI assistants (like GitHub Copilot) to interact with Deephaven.
 */
export class McpServer extends DisposableBase {
  private httpServer: http.Server | null = null;
  private port: number | null = null;
  private transports: Map<string, StreamableHTTPServerTransport> = new Map();
  private servers: Map<string, SdkMcpServer> = new Map();

  constructor(
    readonly coreJsApiCache: IAsyncCacheService<URL, typeof DhcType>,
    readonly outputChannel: OutputChannelWithHistory,
    readonly outputChannelDebug: OutputChannelWithHistory,
    readonly panelService: IPanelService,
    readonly pythonDiagnostics: vscode.DiagnosticCollection,
    readonly pythonWorkspace: FilteredWorkspace,
    readonly serverManager: IServerManager
  ) {
    super();
  }

  private createServer(): SdkMcpServer {
    const server = new SdkMcpServer({
      name: MCP_SERVER_NAME,
      version: '1.0.0',
    });

    this.registerToolsOnServer(server);

    return server;
  }

  private registerToolsOnServer(server: SdkMcpServer): void {
    this.registerTool(server, createAddRemoteFileSourcesTool());
    this.registerTool(server, createConnectToServerTool(this));
    this.registerTool(server, createGetColumnStatsTool(this));
    this.registerTool(server, createGetLogsTool(this));
    this.registerTool(server, createGetTableDataTool(this));
    this.registerTool(server, createGetTableStatsTool(this));
    this.registerTool(server, createListConnectionsTool(this));
    this.registerTool(server, createListVariablesTool(this));
    this.registerTool(server, createListRemoteFileSourcesTool(this));
    this.registerTool(server, createListServersTool(this));
    this.registerTool(server, createOpenFilesInEditorTool());
    this.registerTool(server, createOpenVariablePanelsTool(this));
    this.registerTool(server, createRemoveRemoteFileSourcesTool());
    this.registerTool(server, createRunCodeFromUriTool(this));
    this.registerTool(server, createRunCodeTool(this));
    this.registerTool(server, createSetEditorConnectionTool(this));
    this.registerTool(server, createShowOutputPanelTool(this));
  }

  private registerTool<Spec extends McpToolSpec>(
    server: SdkMcpServer,
    { name, spec, handler }: McpTool<Spec>
  ): void {
    server.registerTool(name, spec, handler);
  }

  private handleInvalidPath(res: http.ServerResponse): void {
    res.writeHead(404, { contentType: 'text/plain' });
    res.end('Not found');
  }

  private handleInvalidMethod(res: http.ServerResponse): void {
    res.writeHead(405, {
      contentType: 'text/plain',
      allow: 'GET, POST',
    });
    res.end('Method Not Allowed');
  }

  private handleSessionNotFound(
    res: http.ServerResponse,
    sessionId: string
  ): void {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: `Bad Request: session ID ${sessionId} not found`,
        },
        id: null,
      })
    );
  }

  private async handleExistingSession(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    requestBody: unknown,
    sessionId: string
  ): Promise<void> {
    if (!this.transports.has(sessionId)) {
      this.handleSessionNotFound(res, sessionId);
      return;
    }

    // Existing session — reuse transport
    const transport = this.transports.get(sessionId)!;
    await transport.handleRequest(req, res, requestBody);
  }

  private handleInvalidSessionIdForRequestType(
    res: http.ServerResponse,
    message: string
  ): void {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message,
        },
        id: null,
      })
    );
  }

  private async handleNewSession(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    requestBody: unknown
  ): Promise<void> {
    // New session — create isolated server + transport pair
    const server = this.createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: (): string => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (sid): void => {
        this.transports.set(sid, transport);
        this.servers.set(sid, server);
      },
    });

    transport.onclose = async (): Promise<void> => {
      try {
        const sid = transport.sessionId;
        if (sid) {
          this.transports.delete(sid);
          const closingServer = this.servers.get(sid);
          this.servers.delete(sid);
          await closingServer?.close();
        }
      } catch (error) {
        this.outputChannelDebug.appendLine(
          `[McpServer] Error during session cleanup: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, requestBody);
  }

  private handleRequestError(res: http.ServerResponse, error: unknown): void {
    res.writeHead(500, { contentType: 'application/json' });
    res.end(
      JSON.stringify({
        error: `Failed to process request: ${error instanceof Error ? error.message : String(error)}`,
      })
    );
  }

  /**
   * Start the MCP server on an HTTP endpoint.
   * Uses stateful session management: each initialize request creates a new
   * isolated server+transport pair stored by session ID. Subsequent requests
   * from the same session reuse the existing transport, eliminating race
   * conditions from multiple concurrent requests.
   *
   * @param preferredPort Optional port to try first. If not provided or unavailable, will auto-allocate.
   * @returns The actual port the server is listening on
   */
  async start(preferredPort?: number): Promise<number> {
    const portToTry = preferredPort ?? 0;

    const { promise, resolve, reject } = withResolvers<number>();

    this.httpServer = http.createServer(async (req, res) => {
      if (req.url !== '/mcp') {
        this.handleInvalidPath(res);
        return;
      }

      // Accept GET (for SSE) and POST (for JSON-RPC) requests.
      // Other methods are not supported by the MCP protocol.
      if (req.method !== 'GET' && req.method !== 'POST') {
        this.handleInvalidMethod(res);
        return;
      }

      // Collect body only for POST requests
      let body = '';
      if (req.method === 'POST') {
        req.on('data', chunk => {
          body += chunk.toString();
        });
      }

      req.on('end', async () => {
        try {
          // Parse body if present, otherwise undefined for GET requests
          const requestBody = body ? JSON.parse(body) : undefined;
          const sessionId = req.headers['mcp-session-id'] as string | undefined;
          const hasSessionId = sessionId != null;

          // GET requests are never initialize requests (SSE only)
          const isInitializeReq = requestBody
            ? isInitializeRequest(requestBody)
            : false;

          // Validate: initialize requests must NOT have a session ID,
          // and non-initialize requests MUST have a session ID.
          if (hasSessionId === isInitializeReq) {
            this.handleInvalidSessionIdForRequestType(
              res,
              hasSessionId
                ? 'Bad Request: initialize request must not include mcp-session-id header'
                : 'Bad Request: include mcp-session-id header for existing sessions, or send an initialize request to start a new session'
            );
            return;
          }

          sessionId == null
            ? await this.handleNewSession(req, res, requestBody)
            : await this.handleExistingSession(
                req,
                res,
                requestBody,
                sessionId
              );
        } catch (error) {
          this.handleRequestError(res, error);
        }
      });
    });

    this.httpServer.listen(portToTry, () => {
      // Get the actual port assigned by the OS (important when port is 0)
      const address = this.httpServer?.address();

      // Address should only be null before listening event fired, and string
      // type should only be returned for pipe or Unix domain socket. Neither of
      // these scenarios should be possible, so this check is mostly just for
      // narrowing the type.
      if (address == null || typeof address === 'string') {
        reject(new Error('Failed to start MCP server: invalid server address'));
        return;
      }

      this.port = address.port;
      resolve(this.port);
    });

    this.httpServer.on('error', (error: NodeJS.ErrnoException) => {
      // If preferred port is in use, try auto-allocating
      if (
        error.code === 'EADDRINUSE' &&
        preferredPort != null &&
        preferredPort !== 0
      ) {
        this.httpServer?.close();
        this.httpServer = null;
        // Retry with auto-allocated port
        this.start().then(resolve).catch(reject);
      } else {
        reject(error);
      }
    });

    return promise;
  }

  /**
   * Get the current port the server is listening on.
   * @returns The port number, or null if the server is not running.
   */
  getPort(): number | null {
    return this.port;
  }

  /**
   * Stop server on dispose.
   */
  override async onDisposing(): Promise<void> {
    await this.stop();
  }

  /**
   * Stop the MCP server.
   */
  async stop(): Promise<void> {
    if (this.httpServer == null) {
      return;
    }

    // Close all active sessions before shutting down the HTTP server
    for (const [sid, transport] of this.transports) {
      try {
        await transport.close();
        await this.servers.get(sid)?.close();
      } catch (error) {
        this.outputChannelDebug.appendLine(
          `[McpServer] Error closing session ${sid}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    this.transports.clear();
    this.servers.clear();

    const { resolve, reject, promise } = withResolvers<void>();

    this.httpServer.close(err => {
      this.httpServer = null;
      this.port = null;

      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });

    return promise;
  }
}
