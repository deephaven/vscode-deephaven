import * as vscode from 'vscode';
import { McpServer as SdkMcpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as http from 'http';
import type { IServerManager, McpTool, McpToolSpec } from '../types';
import { MCP_SERVER_NAME } from '../common';
import { createListConnectionsTool, createRunCodeFromUriTool } from './tools';
import { withResolvers } from '../util';
import { DisposableBase, type FilteredWorkspace } from '../services';

/**
 * MCP Server for Deephaven extension.
 * Provides tools for AI assistants (like GitHub Copilot) to interact with Deephaven.
 */
export class McpServer extends DisposableBase {
  private server: SdkMcpServer;
  private httpServer: http.Server | null = null;
  private port: number | null = null;

  readonly pythonDiagnostics: vscode.DiagnosticCollection;
  readonly pythonWorkspace: FilteredWorkspace;
  readonly serverManager: IServerManager;

  constructor(
    pythonDiagnostics: vscode.DiagnosticCollection,
    pythonWorkspace: FilteredWorkspace,
    serverManager: IServerManager
  ) {
    super();

    this.pythonDiagnostics = pythonDiagnostics;
    this.pythonWorkspace = pythonWorkspace;
    this.serverManager = serverManager;

    // Create an MCP server
    this.server = new SdkMcpServer({
      name: MCP_SERVER_NAME,
      version: '1.0.0',
    });

    this.registerTool(createRunCodeFromUriTool(this));
    this.registerTool(createListConnectionsTool(this));
  }

  private registerTool<Spec extends McpToolSpec>({
    name,
    spec,
    handler,
  }: McpTool<Spec>): void {
    this.server.registerTool(name, spec, handler);
  }

  /**
   * Start the MCP server on an HTTP endpoint.
   * Creates a new transport for each request (stateless operation).
   *
   * @param preferredPort Optional port to try first. If not provided or unavailable, will auto-allocate.
   * @returns The actual port the server is listening on
   */
  async start(preferredPort?: number): Promise<number> {
    const portToTry = preferredPort ?? 0;

    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer(async (req, res) => {
        if (req.url === '/mcp' && req.method === 'POST') {
          // Collect the request body
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });

          req.on('end', async () => {
            try {
              const requestBody = JSON.parse(body);

              // Create a new transport for each request to prevent request ID collisions
              const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined,
                enableJsonResponse: true,
              });

              res.on('close', () => {
                transport.close();
              });

              await this.server.connect(transport);
              await transport.handleRequest(req, res, requestBody);
            } catch (error) {
              res.writeHead(500, { contentType: 'application/json' });
              res.end(
                JSON.stringify({
                  error: `Failed to process request: ${error instanceof Error ? error.message : String(error)}`,
                })
              );
            }
          });
        } else if (req.url === '/mcp' && req.method === 'GET') {
          // MCP spec says servers that dont' support SSE should return 405 for
          // GET requests. TBD: whether we have need for SSE in the future.
          res.writeHead(405, {
            contentType: 'text/plain',
            allow: 'POST',
          });
          res.end('Method Not Allowed');
        } else {
          res.writeHead(404, { contentType: 'text/plain' });
          res.end('Not found');
        }
      });

      this.httpServer.listen(portToTry, () => {
        // Get the actual port assigned by the OS (important when port is 0)
        const address = this.httpServer?.address();
        if (address == null || typeof address === 'string') {
          reject(
            new Error('Failed to start MCP server: invalid server address')
          );
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
