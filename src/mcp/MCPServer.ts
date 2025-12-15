import * as vscode from 'vscode';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import * as http from 'http';
import { randomUUID } from 'crypto';
import type {
  IPanelService,
  IServerManager,
  McpTool,
  McpToolSpec,
} from '../types';
import type { PipServerController } from '../controllers';
import { MCP_SERVER_NAME } from '../common';
import { createRunCodeTool } from './tools/runCode';
import { createListPanelVariablesTool } from './tools/listPanelVariables';
import { createListConnectionsTool } from './tools/listConnections';
import { createListServersTool } from './tools/listServers';
import { createConnectToServerTool } from './tools/connectToServer';
import { createSetEditorConnectionTool } from './tools/setEditorConnection';
import { createOpenVariablePanelsTool } from './tools/openVariablePanels';
import { createStartPipServerTool } from './tools/startPipServer';
import { createCheckPythonEnvTool } from './tools/checkPythonEnvironment';
import { createAddRemoteFileSourcesTool } from './tools/addRemoteFileSources';
import { createOpenFilesInEditorTool } from './tools/openFilesInEditor';
import type { FilteredWorkspace } from '../services';

type Transport = StreamableHTTPServerTransport | SSEServerTransport;

/**
 * MCP Server for Deephaven extension.
 * Provides tools for AI assistants (like GitHub Copilot) to interact with Deephaven.
 */
export class MCPServer {
  private server: McpServer;
  private httpServer: http.Server | null = null;
  private port: number | null = null;
  private readonly panelService: IPanelService;
  private readonly pipServerController: PipServerController;
  private readonly pythonDiagnostics: vscode.DiagnosticCollection;
  private readonly pythonWorkspace: FilteredWorkspace;
  private readonly serverManager: IServerManager;
  // Store transports by session ID (supports both Streamable HTTP and legacy SSE)
  private transports: Map<string, Transport> = new Map();

  constructor(
    panelService: IPanelService,
    pipServerController: PipServerController,
    pythonDiagnostics: vscode.DiagnosticCollection,
    pythonWorkspace: FilteredWorkspace,
    serverManager: IServerManager
  ) {
    this.panelService = panelService;
    this.pipServerController = pipServerController;
    this.pythonDiagnostics = pythonDiagnostics;
    this.pythonWorkspace = pythonWorkspace;
    this.serverManager = serverManager;

    // Create an MCP server
    this.server = new McpServer({
      name: MCP_SERVER_NAME,
      version: '1.0.0',
    });

    this.registerTools();
  }

  private registerTool<Spec extends McpToolSpec>({
    name,
    spec,
    handler,
  }: McpTool<Spec>): void {
    this.server.registerTool(name, spec, handler);
  }

  private registerTools(): void {
    this.registerTool(
      createRunCodeTool(
        this.pythonDiagnostics,
        this.pythonWorkspace,
        this.serverManager
      )
    );
    this.registerTool(
      createListPanelVariablesTool(this.panelService, this.serverManager)
    );
    this.registerTool(createListConnectionsTool(this.serverManager));
    this.registerTool(createListServersTool(this.serverManager));
    this.registerTool(createConnectToServerTool(this.serverManager));
    this.registerTool(createSetEditorConnectionTool(this.serverManager));
    this.registerTool(createOpenVariablePanelsTool(this.serverManager));
    this.registerTool(createStartPipServerTool(this.pipServerController));
    this.registerTool(createCheckPythonEnvTool(this.pipServerController));
    this.registerTool(createAddRemoteFileSourcesTool());
    this.registerTool(createOpenFilesInEditorTool());
  }

  /**
   * Start the MCP server on an HTTP endpoint.
   * Supports both the new Streamable HTTP transport (for VS Code Copilot) and
   * the legacy SSE transport (for Cline and other older clients).
   *
   * Endpoints:
   * - /mcp (GET, POST, DELETE) - Streamable HTTP (new protocol, 2025-03-26)
   * - GET /sse - Legacy SSE stream establishment (protocol 2024-11-05)
   * - POST /messages?sessionId=xxx - Legacy SSE message posting
   *
   * @param preferredPort Optional port to try first. If not provided or unavailable, will auto-allocate.
   * @returns The actual port the server is listening on
   */
  async start(preferredPort?: number): Promise<number> {
    const portToTry = preferredPort ?? 0;

    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer(async (req, res) => {
        const url = new URL(req.url ?? '', `http://localhost`);

        //=====================================================================
        // Streamable HTTP Transport (Protocol version 2025-03-26)
        // Supports GET (SSE stream), POST (requests), DELETE (terminate)
        //=====================================================================
        if (url.pathname === '/mcp') {
          // Collect body for POST requests
          let body = '';
          if (req.method === 'POST') {
            await new Promise<void>(resolveBody => {
              req.on('data', chunk => {
                body += chunk.toString();
              });
              req.on('end', resolveBody);
            });
          }

          try {
            // Check for existing session ID in header
            const sessionId = req.headers['mcp-session-id'] as
              | string
              | undefined;
            let transport: StreamableHTTPServerTransport | undefined;

            if (sessionId && this.transports.has(sessionId)) {
              // Reuse existing transport for this session
              const existingTransport = this.transports.get(sessionId);
              if (existingTransport instanceof StreamableHTTPServerTransport) {
                transport = existingTransport;
              } else {
                // Session exists but uses different transport protocol
                // eslint-disable-next-line @typescript-eslint/naming-convention
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(
                  JSON.stringify({
                    jsonrpc: '2.0',
                    error: {
                      code: -32000,
                      message:
                        'Bad Request: Session exists but uses a different transport protocol',
                    },
                    id: null,
                  })
                );
                return;
              }
            } else if (
              !sessionId &&
              req.method === 'POST' &&
              isInitializeRequest(JSON.parse(body))
            ) {
              // Create new transport for initialization request
              transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: (): string => randomUUID(),
                onsessioninitialized: (newSessionId: string): void => {
                  // Store the transport by session ID when session is initialized
                  this.transports.set(newSessionId, transport!);
                },
              });

              // Set up onclose handler to clean up transport when closed
              transport.onclose = (): void => {
                const sid = transport!.sessionId;
                if (sid && this.transports.has(sid)) {
                  this.transports.delete(sid);
                }
              };

              // Connect the transport to the MCP server
              await this.server.connect(transport);
            } else {
              // Invalid request - no session ID or not initialization request
              // eslint-disable-next-line @typescript-eslint/naming-convention
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  jsonrpc: '2.0',
                  error: {
                    code: -32000,
                    message: 'Bad Request: No valid session ID provided',
                  },
                  id: null,
                })
              );
              return;
            }

            // Handle the request with the transport (GET, POST, or DELETE)
            const requestBody = body ? JSON.parse(body) : undefined;
            await transport.handleRequest(req, res, requestBody);
          } catch (error) {
            if (!res.headersSent) {
              // eslint-disable-next-line @typescript-eslint/naming-convention
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  jsonrpc: '2.0',
                  error: {
                    code: -32603,
                    message: 'Internal server error',
                  },
                  id: null,
                })
              );
            }
          }
        }
        //=====================================================================
        // Legacy SSE Transport (Protocol version 2024-11-05)
        //=====================================================================
        // Establish SSE stream (GET /sse)
        else if (url.pathname === '/sse' && req.method === 'GET') {
          const transport = new SSEServerTransport('/messages', res);
          this.transports.set(transport.sessionId, transport);

          res.on('close', () => {
            this.transports.delete(transport.sessionId);
          });

          await this.server.connect(transport);
        }
        // Handle messages (POST /messages)
        else if (url.pathname === '/messages' && req.method === 'POST') {
          const sessionId = url.searchParams.get('sessionId');
          if (!sessionId) {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing sessionId parameter' }));
            return;
          }

          const existingTransport = this.transports.get(sessionId);
          if (!existingTransport) {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({ error: 'No transport found for sessionId' })
            );
            return;
          }

          if (!(existingTransport instanceof SSEServerTransport)) {
            // Session exists but uses different transport protocol
            // eslint-disable-next-line @typescript-eslint/naming-convention
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                jsonrpc: '2.0',
                error: {
                  code: -32000,
                  message:
                    'Bad Request: Session exists but uses a different transport protocol',
                },
                id: null,
              })
            );
            return;
          }

          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });

          req.on('end', async () => {
            try {
              await existingTransport.handlePostMessage(req, res, body);
            } catch (error) {
              if (!res.headersSent) {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(
                  JSON.stringify({
                    jsonrpc: '2.0',
                    error: {
                      code: -32603,
                      message: 'Internal server error',
                    },
                    id: null,
                  })
                );
              }
            }
          });
        } else {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
        }
      });

      this.httpServer.listen(portToTry, () => {
        // Get the actual port assigned by the OS (important when port is 0)
        const address = this.httpServer!.address();
        if (address && typeof address !== 'string') {
          this.port = address.port;
        }
        resolve(this.port!);
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
          this.start(0).then(resolve).catch(reject);
        } else {
          vscode.window.showErrorMessage(
            `Failed to start MCP server: ${error.message}`
          );
          reject(error);
        }
      });
    });
  }

  /**
   * Get the current port the server is listening on.
   * @returns The port number, or null if the server is not running.
   */
  getPort(): number | null {
    return this.port;
  }

  /**
   * Stop the MCP server.
   */
  async stop(): Promise<void> {
    // Close all active transports to properly clean up resources
    for (const [sessionId, transport] of this.transports) {
      try {
        await transport.close();
      } catch {
        // Ignore errors during cleanup
      }
      this.transports.delete(sessionId);
    }

    if (this.httpServer) {
      return new Promise((resolve, reject) => {
        this.httpServer!.close(err => {
          if (err) {
            reject(err);
          } else {
            this.httpServer = null;
            this.port = null;
            resolve();
          }
        });
      });
    }
  }
}
