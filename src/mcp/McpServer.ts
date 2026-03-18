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
        res.writeHead(404, { contentType: 'text/plain' });
        res.end('Not found');
      }

      // Only accept POST requests since we don't currenlty support SSE. TBD
      // whether we need SSE in the future.
      if (req.method !== 'POST') {
        res.writeHead(405, {
          contentType: 'text/plain',
          allow: 'POST',
        });
        res.end('Method Not Allowed');
        return;
      }

      // Collect the request body
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const requestBody = JSON.parse(body);
          const sessionId = req.headers['mcp-session-id'] as string | undefined;

          if (sessionId && this.transports.has(sessionId)) {
            // Existing session — reuse transport
            const transport = this.transports.get(sessionId)!;
            await transport.handleRequest(req, res, requestBody);
          } else if (!sessionId && isInitializeRequest(requestBody)) {
            // New session — create isolated server + transport pair
            const server = this.createServer();
            const transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => randomUUID(),
              enableJsonResponse: true,
              onsessioninitialized: sid => {
                this.transports.set(sid, transport);
                this.servers.set(sid, server);
              },
            });

            transport.onclose = async () => {
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
          } else {
            // Invalid combination: no session ID on a non-initialize request
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                jsonrpc: '2.0',
                error: {
                  code: -32600,
                  message:
                    'Bad Request: include mcp-session-id header for existing sessions, or send an initialize request to start a new session',
                },
                id: null,
              })
            );
          }
        } catch (error) {
          res.writeHead(500, { contentType: 'application/json' });
          res.end(
            JSON.stringify({
              error: `Failed to process request: ${error instanceof Error ? error.message : String(error)}`,
            })
          );
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
